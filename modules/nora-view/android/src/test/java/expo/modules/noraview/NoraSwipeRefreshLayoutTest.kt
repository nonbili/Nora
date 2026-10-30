package expo.modules.noraview

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NoraSwipeRefreshLayoutTest {
  private val slop = 16

  @Test
  fun sidewaysSwipeDriftingDownIsLeftToThePage() {
    assertTrue(isSidewaysDrag(-80f, 24f, slop))
    assertTrue(isSidewaysDrag(80f, 24f, slop))
  }

  @Test
  fun pullDownIsNotSideways() {
    assertFalse(isSidewaysDrag(10f, 60f, slop))
    assertFalse(isSidewaysDrag(30f, 30f, slop))
  }

  @Test
  fun movementWithinTheSlopIsUndecided() {
    assertFalse(isSidewaysDrag(12f, 2f, slop))
  }
}
