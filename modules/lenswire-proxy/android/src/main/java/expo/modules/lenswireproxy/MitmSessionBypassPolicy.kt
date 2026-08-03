package expo.modules.lenswireproxy

/**
 * Session MITM bypass policy for HardFailure paths that historically poisoned
 * a whole host (killing later WSS reconnects until VPN stop).
 */
object MitmSessionBypassPolicy {
  /**
   * Idle timeout with no HTTP after MITM handshake must not session-bypass the host.
   * Speculative/warm CONNECTs otherwise permanently tunnel WSS until Stop VPN.
   */
  fun shouldSessionBypassNoRequestTimeout(): Boolean = false

  /**
   * Unsupported protocol after MITM (e.g. HTTP/2 sniff). Do not session-bypass when
   * this host already completed a successful WebSocket MITM in the current session —
   * a parallel H2 CONNECT must not kill classic HTTP/1.1 Upgrade WSS.
   */
  fun shouldSessionBypassUnsupported(hostHadSuccessfulWsMitm: Boolean): Boolean =
    !hostHadSuccessfulWsMitm
}
