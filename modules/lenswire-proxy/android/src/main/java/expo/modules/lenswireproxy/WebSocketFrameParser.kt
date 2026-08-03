package expo.modules.lenswireproxy

import android.util.Base64
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/** RFC 6455 frame parse + display helpers for read-only WebSocket inspect. */
internal object WebSocketFrames {
  const val MAX_FRAMES = 500
  const val MAX_TEXT_BYTES = 64 * 1024
  const val MAX_BINARY_PREVIEW = 256
  const val FLUSH_INTERVAL_MS = 250L
  const val MAX_PAYLOAD_BYTES = 16 * 1024 * 1024
  const val MAX_ASSEMBLED_BYTES = 16 * 1024 * 1024

  const val OPCODE_CONTINUATION = 0
  const val OPCODE_TEXT = 1
  const val OPCODE_BINARY = 2
  const val OPCODE_CLOSE = 8
  const val OPCODE_PING = 9
  const val OPCODE_PONG = 10

  fun opcodeName(opcode: Int): String = when (opcode) {
    OPCODE_CONTINUATION -> "continuation"
    OPCODE_TEXT -> "text"
    OPCODE_BINARY -> "binary"
    OPCODE_CLOSE -> "close"
    OPCODE_PING -> "ping"
    OPCODE_PONG -> "pong"
    else -> "opcode_$opcode"
  }

  fun classifyPayload(opcode: Int, payload: ByteArray, rsv: Int = 0): Map<String, Any?> {
    if (opcode == OPCODE_CLOSE) return classifyClose(payload)
    // RSV bits indicate extensions (commonly permessage-deflate) — do not UTF-8 decode as text.
    if (rsv != 0) return classifyBinary(payload, compressed = true)
    return when (opcode) {
      OPCODE_TEXT, OPCODE_PING, OPCODE_PONG -> classifyTextish(payload)
      OPCODE_BINARY -> classifyBinary(payload)
      else -> classifyBinary(payload)
    }
  }

  private fun classifyClose(payload: ByteArray): Map<String, Any?> {
    if (payload.isEmpty()) {
      return mapOf("kind" to "empty", "size" to 0)
    }
    if (payload.size >= 2) {
      val code = ((payload[0].toInt() and 0xff) shl 8) or (payload[1].toInt() and 0xff)
      val reason = if (payload.size > 2) {
        String(payload, 2, payload.size - 2, Charsets.UTF_8)
      } else {
        ""
      }
      val text = if (reason.isEmpty()) "code=$code" else "code=$code reason=$reason"
      return mapOf(
        "kind" to "text",
        "text" to text,
        "size" to payload.size,
        "truncated" to false,
        "closeCode" to code,
      )
    }
    return classifyBinary(payload)
  }

  private fun classifyTextish(payload: ByteArray): Map<String, Any?> {
    if (payload.isEmpty()) {
      return mapOf("kind" to "empty", "size" to 0)
    }
    var text = String(payload, Charsets.UTF_8)
    val size = payload.size
    val trimmed = text.trimStart()
    val kind = if (trimmed.firstOrNull() in setOf('{', '[')) {
      text = CaptureFormatting.prettyJson(text)
      "json"
    } else {
      "text"
    }
    val truncated = payload.size > MAX_TEXT_BYTES || text.toByteArray(Charsets.UTF_8).size > MAX_TEXT_BYTES
    val clipped = if (text.length > MAX_TEXT_BYTES) {
      text.substring(0, MAX_TEXT_BYTES) + "\n\n...truncated..."
    } else {
      text
    }
    return mapOf(
      "kind" to kind,
      "text" to clipped,
      "size" to size,
      "truncated" to truncated,
    )
  }

  private fun classifyBinary(payload: ByteArray, compressed: Boolean = false): Map<String, Any?> {
    if (payload.isEmpty()) {
      return buildMap {
        put("kind", "empty")
        put("size", 0)
        if (compressed) put("compressed", true)
      }
    }
    val truncated = payload.size > MAX_BINARY_PREVIEW
    val preview = if (truncated) payload.copyOf(MAX_BINARY_PREVIEW) else payload
    return buildMap {
      put("kind", "binary")
      put("size", payload.size)
      put("truncated", truncated)
      put("previewBase64", Base64.encodeToString(preview, Base64.NO_WRAP))
      if (compressed) put("compressed", true)
    }
  }

  fun closeCodeFromPayload(payload: ByteArray): Int? {
    if (payload.size < 2) return null
    return ((payload[0].toInt() and 0xff) shl 8) or (payload[1].toInt() and 0xff)
  }

  fun displayFrame(
    dir: String,
    opcode: Int,
    payload: ByteArray,
    rsv: Int = 0,
    atMs: Long = System.currentTimeMillis(),
  ): Map<String, Any?> = mapOf(
    "id" to UUID.randomUUID().toString(),
    "at" to atMs,
    "dir" to dir,
    "opcode" to opcodeName(opcode),
    "size" to payload.size,
    "payload" to classifyPayload(opcode, payload, rsv),
  )
}

/** Incremental RFC 6455 frame parser. Forwards bytes separately; this only inspects. */
internal class WebSocketFrameParser {
  private val pending = ByteArrayOutputStream()

  data class RawFrame(
    val fin: Boolean,
    val opcode: Int,
    /** Unmasked payload for display (empty when [oversized]). */
    val payload: ByteArray,
    val rsv: Int = 0,
    /** True when payload exceeded MAX_PAYLOAD_BYTES and was skipped. */
    val oversized: Boolean = false,
  )

  fun append(bytes: ByteArray, offset: Int = 0, length: Int = bytes.size) {
    if (length <= 0) return
    pending.write(bytes, offset, length)
  }

  fun append(bytes: ByteArray) = append(bytes, 0, bytes.size)

  fun drain(): List<RawFrame> {
    val buf = pending.toByteArray()
    var index = 0
    val out = ArrayList<RawFrame>()
    while (true) {
      val parsed = parseOne(buf, index) ?: break
      out.add(parsed.frame)
      index = parsed.nextIndex
    }
    if (index > 0) {
      pending.reset()
      if (index < buf.size) {
        pending.write(buf, index, buf.size - index)
      }
    }
    return out
  }

  private data class ParseResult(val frame: RawFrame, val nextIndex: Int)

  private fun parseOne(buf: ByteArray, start: Int): ParseResult? {
    if (buf.size - start < 2) return null
    val b0 = buf[start].toInt() and 0xff
    val b1 = buf[start + 1].toInt() and 0xff
    val fin = (b0 and 0x80) != 0
    val rsv = (b0 and 0x70) shr 4
    val opcode = b0 and 0x0f
    val masked = (b1 and 0x80) != 0
    var payloadLen = (b1 and 0x7f).toLong()
    var headerLen = 2

    when (payloadLen) {
      126L -> {
        if (buf.size - start < 4) return null
        payloadLen = ((buf[start + 2].toInt() and 0xff) shl 8 or (buf[start + 3].toInt() and 0xff)).toLong()
        headerLen = 4
      }
      127L -> {
        if (buf.size - start < 10) return null
        val bb = ByteBuffer.wrap(buf, start + 2, 8).order(ByteOrder.BIG_ENDIAN)
        payloadLen = bb.long
        if (payloadLen < 0) return null
        headerLen = 10
      }
    }

    if (payloadLen > WebSocketFrames.MAX_PAYLOAD_BYTES) {
      val maskLen = if (masked) 4 else 0
      val total = headerLen + maskLen + payloadLen
      if (buf.size - start < total) return null
      return ParseResult(
        frame = RawFrame(
          fin = fin,
          opcode = opcode,
          payload = ByteArray(0),
          rsv = rsv,
          oversized = true,
        ),
        nextIndex = start + total.toInt(),
      )
    }

    val maskLen = if (masked) 4 else 0
    val total = headerLen + maskLen + payloadLen.toInt()
    if (buf.size - start < total) return null

    val maskStart = start + headerLen
    val payloadStart = maskStart + maskLen
    val payload = buf.copyOfRange(payloadStart, payloadStart + payloadLen.toInt())
    if (masked) {
      val key0 = buf[maskStart].toInt()
      val key1 = buf[maskStart + 1].toInt()
      val key2 = buf[maskStart + 2].toInt()
      val key3 = buf[maskStart + 3].toInt()
      for (i in payload.indices) {
        val key = when (i % 4) {
          0 -> key0
          1 -> key1
          2 -> key2
          else -> key3
        }
        payload[i] = (payload[i].toInt() xor key).toByte()
      }
    }
    return ParseResult(
      frame = RawFrame(fin = fin, opcode = opcode, payload = payload, rsv = rsv),
      nextIndex = start + total,
    )
  }
}

/**
 * Assembles fragmented data messages (opcode text/binary + continuation) into one display unit.
 * Control frames are emitted immediately.
 */
internal class WebSocketMessageAssembler {
  data class Assembled(
    val opcode: Int,
    val payload: ByteArray,
    val rsv: Int = 0,
    /** True when frame/message was dropped (oversized or assemble cap); do not display. */
    val omitted: Boolean = false,
  )

  private var startedOpcode: Int? = null
  private var startedRsv: Int = 0
  private val chunks = ByteArrayOutputStream()

  /** Returns a completed message, or null if still fragmenting. */
  fun accept(frame: WebSocketFrameParser.RawFrame): Assembled? {
    val opcode = frame.opcode

    if (frame.oversized) {
      // Drop in-progress assemble; never emit empty placeholder messages.
      reset()
      return if (frame.fin) Assembled(opcode = opcode, payload = ByteArray(0), omitted = true) else null
    }

    if (opcode == WebSocketFrames.OPCODE_CLOSE ||
      opcode == WebSocketFrames.OPCODE_PING ||
      opcode == WebSocketFrames.OPCODE_PONG
    ) {
      return Assembled(opcode = opcode, payload = frame.payload, rsv = frame.rsv)
    }

    if (opcode == WebSocketFrames.OPCODE_TEXT || opcode == WebSocketFrames.OPCODE_BINARY) {
      startedOpcode = opcode
      startedRsv = frame.rsv
      chunks.reset()
      if (!appendChunk(frame.payload)) {
        reset()
        return if (frame.fin) Assembled(opcode = opcode, payload = ByteArray(0), omitted = true) else null
      }
      if (frame.fin) {
        val out = Assembled(startedOpcode!!, chunks.toByteArray(), startedRsv)
        reset()
        return out
      }
      return null
    }

    if (opcode == WebSocketFrames.OPCODE_CONTINUATION) {
      if (startedOpcode == null) {
        return if (frame.fin) {
          Assembled(WebSocketFrames.OPCODE_BINARY, frame.payload, frame.rsv)
        } else {
          null
        }
      }
      if (!appendChunk(frame.payload)) {
        val op = startedOpcode!!
        reset()
        return if (frame.fin) Assembled(opcode = op, payload = ByteArray(0), omitted = true) else null
      }
      if (frame.fin) {
        val out = Assembled(startedOpcode!!, chunks.toByteArray(), startedRsv)
        reset()
        return out
      }
      return null
    }

    return if (frame.fin) Assembled(opcode, frame.payload, frame.rsv) else null
  }

  private fun appendChunk(payload: ByteArray): Boolean {
    if (chunks.size().toLong() + payload.size > WebSocketFrames.MAX_ASSEMBLED_BYTES) {
      return false
    }
    chunks.write(payload)
    return true
  }

  private fun reset() {
    startedOpcode = null
    startedRsv = 0
    chunks.reset()
  }
}

/** Throttled writer that grows `wsFrames` on an existing capture. */
internal class WsFrameCaptureRecorder(
  private val context: android.content.Context,
  private val captureId: String,
) {
  private val lock = Any()
  private val pending = ArrayList<Map<String, Any?>>()
  private var lastFlushMs = 0L
  private var totalRecorded = 0
  private var omitted = false
  private var compressed = false
  private var idleFlushFuture: ScheduledFuture<*>? = null
  private val recorderDone = AtomicBoolean(false)
  private val sessionClosed = AtomicBoolean(false)
  private var endReason: String? = null
  private var endCloseCode: Int? = null
  private var endedAtMs: Long? = null

  fun record(dir: String, opcode: Int, payload: ByteArray, rsv: Int = 0) {
    synchronized(lock) {
      if (recorderDone.get()) return
      if (rsv != 0) compressed = true
      val isClose = opcode == WebSocketFrames.OPCODE_CLOSE
      if (totalRecorded >= WebSocketFrames.MAX_FRAMES && !isClose) {
        if (!omitted) {
          omitted = true
          scheduleFlushLocked(force = true)
        }
        return
      }
      totalRecorded += 1
      pending.add(WebSocketFrames.displayFrame(dir, opcode, payload, rsv))
      if (isClose) {
        val code = WebSocketFrames.closeCodeFromPayload(payload)
        markClosedLocked("close_frame", code)
      }
      scheduleFlushLocked(force = isClose)
      if (!isClose) scheduleIdleFlushLocked()
    }
  }

  fun markOmitted() {
    synchronized(lock) {
      if (recorderDone.get()) return
      if (!omitted) {
        omitted = true
        scheduleFlushLocked(force = true)
      }
    }
  }

  fun markCompressed() {
    synchronized(lock) {
      if (recorderDone.get()) return
      compressed = true
    }
  }

  /** Once: persist wsClosed on the capture. Prefer close_frame over eof/error. */
  fun markClosed(reason: String, closeCode: Int? = null) {
    synchronized(lock) {
      markClosedLocked(reason, closeCode)
      scheduleFlushLocked(force = true)
      idleFlushFuture?.cancel(false)
      idleFlushFuture = null
    }
  }

  fun flush(force: Boolean = true) {
    synchronized(lock) {
      scheduleFlushLocked(force = force)
      if (force) {
        idleFlushFuture?.cancel(false)
        idleFlushFuture = null
      }
    }
  }

  fun close() {
    markClosed("eof")
    recorderDone.set(true)
    flush(force = true)
    synchronized(lock) {
      idleFlushFuture?.cancel(false)
      idleFlushFuture = null
    }
  }

  private fun markClosedLocked(reason: String, closeCode: Int?) {
    if (sessionClosed.get()) {
      val existing = endReason
      if (existing == "close_frame" || reason != "close_frame") return
    }
    sessionClosed.set(true)
    endReason = reason
    if (closeCode != null) endCloseCode = closeCode
    if (endedAtMs == null) endedAtMs = System.currentTimeMillis()
  }

  private fun scheduleIdleFlushLocked() {
    idleFlushFuture?.cancel(false)
    idleFlushFuture = idleFlushScheduler.schedule({
      if (recorderDone.get()) return@schedule
      flush(force = true)
    }, WebSocketFrames.FLUSH_INTERVAL_MS, TimeUnit.MILLISECONDS)
  }

  /**
   * Snapshot pending frames and persist off the relay thread.
   * CaptureStore I/O must never block WebSocket forwarding (reconnect latency).
   */
  private fun scheduleFlushLocked(force: Boolean) {
    val now = System.currentTimeMillis()
    if (!force && pending.isEmpty() && !sessionClosed.get()) return
    if (!force && now - lastFlushMs < WebSocketFrames.FLUSH_INTERVAL_MS && pending.size < 8) {
      return
    }
    val shouldFlushClosed = force && sessionClosed.get()
    if (pending.isEmpty() && !(force && (omitted || compressed || shouldFlushClosed))) return
    val batch = ArrayList(pending)
    pending.clear()
    lastFlushMs = now
    val closed = sessionClosed.get()
    val reason = endReason
    val closeCode = endCloseCode
    val endedAt = endedAtMs
    val omit = omitted
    val comp = compressed
    val id = captureId
    val ctx = context
    idleFlushScheduler.execute {
      runCatching {
        if (batch.isEmpty() && closed) {
          CaptureStore.markWsClosed(
            ctx,
            id,
            reason ?: "eof",
            closeCode,
            endedAt ?: System.currentTimeMillis(),
          )
        } else {
          CaptureStore.appendWsFrames(
            ctx,
            id,
            batch,
            omit,
            comp,
            wsClosed = closed,
            endedAt = if (closed) endedAt else null,
            wsEndReason = if (closed) reason else null,
            wsCloseCode = if (closed) closeCode else null,
          )
        }
      }
    }
  }

  companion object {
    private val idleFlushScheduler = Executors.newSingleThreadScheduledExecutor { r ->
      Thread(r, "lenswire-ws-flush").apply { isDaemon = true }
    }
  }
}
