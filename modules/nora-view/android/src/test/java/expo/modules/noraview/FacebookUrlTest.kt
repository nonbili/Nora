package expo.modules.noraview

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FacebookUrlTest {
  @Test
  fun detectsMessengerAndMarketplacePathsOnFacebookHosts() {
    assertTrue(isMessengerUrl("https://www.facebook.com/messages"))
    assertTrue(isMessengerUrl("https://m.facebook.com/messages/t/123/"))
    assertTrue(isMarketplaceUrl("https://www.facebook.com/marketplace"))
    assertTrue(isMarketplaceUrl("https://m.facebook.com/marketplace/item/123456/"))
    assertTrue(isDesktopFacebookUrl("https://m.facebook.com/marketplace/item/123456/"))

    assertFalse(isMarketplaceUrl("https://m.facebook.com/marketplace-other"))
    assertFalse(isMarketplaceUrl("http://m.facebook.com/marketplace/"))
    assertFalse(isMarketplaceUrl("https://example.com/marketplace/"))
  }

  @Test
  fun rewritesMobileFacebookUrlToDesktop() {
    assertEquals(
      "https://www.facebook.com/marketplace/item/123456/?ref=search",
      desktopFacebookUrl("https://m.facebook.com/marketplace/item/123456/?ref=search"),
    )
    assertEquals(
      "https://www.facebook.com/messages/",
      desktopFacebookUrl("https://m.facebook.com/messages/"),
    )
  }

  @Test
  fun keepsMarketplaceAndMessengerOnDesktopWithoutStuckDesktopFeed() {
    assertFalse(
      shouldRedirectFacebookToMobile(
        currentUrl = "https://m.facebook.com/",
        targetUrl = "https://www.facebook.com/marketplace/item/123456/",
        desktopMode = false,
      ),
    )
    assertFalse(
      shouldRedirectFacebookToMobile(
        currentUrl = "https://m.facebook.com/",
        targetUrl = "https://www.facebook.com/messages/",
        desktopMode = false,
      ),
    )
    assertTrue(
      shouldRedirectFacebookToMobile(
        currentUrl = "https://www.facebook.com/marketplace/item/123456/",
        targetUrl = "https://www.facebook.com/",
        desktopMode = false,
      ),
    )
    assertFalse(
      shouldRedirectFacebookToMobile(
        currentUrl = "https://www.facebook.com/messages/t/123/",
        targetUrl = "https://www.facebook.com/photo/?fbid=1",
        desktopMode = false,
      ),
    )
  }
}
