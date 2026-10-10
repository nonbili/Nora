package expo.modules.noraview

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

private val hosts = listOf("www.instagram.com", "x.com", "bsky.app")

class InAppUrlTest {
  // Instagram's app links name the bare domain; Nora's host is the www one.
  @Test
  fun mapsTheBareDomainOntoTheHostNoraShows() {
    assertEquals(
      "https://www.instagram.com/p/abc/",
      inAppUrlFor("https://instagram.com/p/abc/", hosts),
    )
  }

  @Test
  fun keepsPathQueryAndFragment() {
    assertEquals(
      "https://www.instagram.com/p/abc/?img_index=2#top",
      inAppUrlFor("https://instagram.com/p/abc/?img_index=2#top", hosts),
    )
  }

  @Test
  fun keepsAHostThatIsAlreadyNoras() {
    assertEquals("https://x.com/NASA/status/1", inAppUrlFor("https://x.com/NASA/status/1", hosts))
    assertEquals("https://bsky.app/profile/a", inAppUrlFor("https://bsky.app/profile/a", hosts))
  }

  // Instagram asks for its app through an `applink.` address of the same site.
  @Test
  fun mapsAnAppLinkAddressOntoTheSite() {
    assertEquals(
      "https://www.instagram.com/artefr/?ig_mid=1",
      inAppUrlFor("https://applink.instagram.com/artefr/?ig_mid=1", hosts),
    )
  }

  // Plain http would get round the setting that blocks it, so the page asked for is always https.
  @Test
  fun alwaysAsksForHttps() {
    assertEquals("https://x.com/NASA", inAppUrlFor("http://x.com/NASA", hosts))
  }

  @Test
  fun refusesASiteNoraDoesNotShow() {
    assertNull(inAppUrlFor("https://example.com/p/abc/", hosts))
    assertNull(inAppUrlFor("https://applink.example.com/p/abc/", hosts))
  }

  @Test
  fun refusesAHostThatOnlyLooksLikeOne() {
    assertNull(inAppUrlFor("https://instagram.com.evil.net/p/abc/", hosts))
    assertNull(inAppUrlFor("https://notinstagram.com/p/abc/", hosts))
  }

  @Test
  fun refusesAnythingThatIsNotAWebAddress() {
    assertNull(inAppUrlFor(null, hosts))
    assertNull(inAppUrlFor("", hosts))
    assertNull(inAppUrlFor("intent://instagram.com/p/abc/#Intent;end", hosts))
    assertNull(inAppUrlFor("not a url", hosts))
    assertNull(inAppUrlFor("javascript:alert(1)", hosts))
  }
}
