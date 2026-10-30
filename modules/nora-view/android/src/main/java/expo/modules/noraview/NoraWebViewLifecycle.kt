package expo.modules.noraview

import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import java.util.Collections
import java.util.WeakHashMap

/** WebView timers are process-wide, so activity switches must not pause them. Main thread only. */
internal object NoraWebViewLifecycle : DefaultLifecycleObserver {
  private val views = Collections.newSetFromMap(WeakHashMap<NouWebView, Boolean>())
  private var observing = false
  private var foreground = false

  fun register(view: NouWebView) {
    if (!observing) {
      val lifecycle = ProcessLifecycleOwner.get().lifecycle
      foreground = lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)
      observing = true
      lifecycle.addObserver(this)
    }
    views.add(view)
    // Also cover a WebView created while the process is already in the background.
    if (foreground) view.resumeTimers() else view.pauseTimers()
    view.setAppForeground(foreground)
  }

  fun unregister(view: NouWebView) {
    views.remove(view)
  }

  override fun onStart(owner: LifecycleOwner) {
    foreground = true
    views.firstOrNull()?.resumeTimers()
    views.forEach { it.setAppForeground(true) }
  }

  override fun onStop(owner: LifecycleOwner) {
    foreground = false
    views.forEach { it.setAppForeground(false) }
    views.firstOrNull()?.pauseTimers()
  }
}
