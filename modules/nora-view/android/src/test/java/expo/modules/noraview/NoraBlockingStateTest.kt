package expo.modules.noraview

import org.junit.Assert.*
import org.junit.Test

class NoraBlockingStateTest {
  @Test fun lateDiskRestoreCannotOverwriteNewBrowserState() {
    val store = NoraBlockingStateStore()
    store.update(NoraBlockingState(true, "new.example"))
    store.restore(NoraBlockingState(true, "old.example"))
    assertTrue(store.current.shouldBlock("new.example"))
    assertFalse(store.current.shouldBlock("old.example"))
  }

  @Test fun browserCanReplaceRestoredOrDisabledState() {
    val store = NoraBlockingStateStore()
    store.restore(NoraBlockingState(true, "ads.example"))
    assertTrue(store.current.shouldBlock("ads.example"))
    store.update(NoraBlockingState())
    assertFalse(store.current.shouldBlock("ads.example"))
    store.restore(NoraBlockingState(true, "ads.example"))
    assertFalse(store.current.shouldBlock("ads.example"))
  }

  @Test fun moreSpecificAllowAndBlockRulesWin() {
    val state = NoraBlockingState(true, "example.com\nads.safe.example.com", "safe.example.com")
    assertTrue(state.shouldBlock("ads.example.com"))
    assertFalse(state.shouldBlock("safe.example.com"))
    assertFalse(state.shouldBlock("cdn.safe.example.com"))
    assertTrue(state.shouldBlock("ads.safe.example.com"))
    assertFalse(state.shouldBlock("notexample.com"))
  }

  @Test fun cosmeticsMatchTheSharedBrowserDomainAndExceptionRules() {
    val rules = NoraCosmeticRules("##.generic\nexample.com##.site\n~example.com##.other\nother.com##.unrelated\ninvalid", "example.com#@#.generic")
    assertEquals(".site{display:none!important;}", rules.cssForHost("news.example.com"))
    assertEquals(".generic{display:none!important;}\n.other{display:none!important;}", rules.cssForHost("notexample.com"))
    assertEquals(".site{display:none!important;}", rules.cssForHost("NEWS.EXAMPLE.COM"))
  }

  @Test fun cachedCosmeticsDoNotLeakAcrossHostsOrSnapshots() {
    val rules = NoraCosmeticRules("x.com##.ad\nexample.com##.other", "x.com#@#.other")
    assertEquals(".ad{display:none!important;}", rules.cssForHost("x.com"))
    assertEquals(".other{display:none!important;}", rules.cssForHost("example.com"))
    assertEquals("", NoraCosmeticRules("", "").cssForHost("x.com"))
  }
}
