package expo.modules.lenswireproxy

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MitmSessionBypassPolicyTest {
  @Test
  fun `no-request timeout never session-bypasses`() {
    assertFalse(MitmSessionBypassPolicy.shouldSessionBypassNoRequestTimeout())
  }

  @Test
  fun `unsupported bypasses only when host has no prior WS MITM`() {
    assertTrue(MitmSessionBypassPolicy.shouldSessionBypassUnsupported(false))
    assertFalse(MitmSessionBypassPolicy.shouldSessionBypassUnsupported(true))
  }
}
