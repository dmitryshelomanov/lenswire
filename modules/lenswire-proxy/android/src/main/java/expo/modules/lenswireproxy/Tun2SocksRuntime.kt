package expo.modules.lenswireproxy

import engine.Engine
import engine.Key
import java.util.concurrent.atomic.AtomicBoolean

class Tun2SocksRuntime(
  private val tunFd: Int,
  private val socksPort: Int,
  private val mtu: Int,
) {
  private val running = AtomicBoolean(false)
  private var thread: Thread? = null

  fun start() {
    if (!running.compareAndSet(false, true)) return

    val key = Key().apply {
      setDevice("fd://$tunFd")
      setProxy("socks5://127.0.0.1:$socksPort")
      setInterface("")
      setLogLevel("warning")
      setRestAPI("")
      setTCPSendBufferSize("")
      setTCPReceiveBufferSize("")
      setTCPModerateReceiveBuffer(false)
      setMark(0)
      setMTU(mtu.toLong())
    }

    // Engine.start() can be long-running depending on build/runtime; isolate it.
    thread = Thread({
      try {
        Engine.touch()
        Engine.insert(key)
        Engine.start()
      } finally {
        running.set(false)
      }
    }, "lenswire-tun2socks").apply { start() }
  }

  fun stop() {
    if (!running.get()) return
    runCatching { Engine.stop() }
    thread?.interrupt()
    thread = null
    running.set(false)
  }

  fun isRunning(): Boolean = running.get()
}
