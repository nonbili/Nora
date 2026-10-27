package expo.modules.noraview

import android.app.Activity
import android.content.Intent
import android.net.Uri
import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Routes save dialogs separately from WebView uploads, including concurrent downloads. */
internal class NoraDownloadPicker {
  private val pending = mutableMapOf<Int, CancellableContinuation<Uri?>>()
  private var nextRequestCode = 20000

  suspend fun createDocument(activity: Activity, fileName: String, mimeType: String): Uri? =
    withContext(Dispatchers.Main) {
      suspendCancellableCoroutine { continuation ->
        while (pending.containsKey(nextRequestCode)) {
          nextRequestCode = if (nextRequestCode == 29999) 20000 else nextRequestCode + 1
        }
        val requestCode = nextRequestCode
        nextRequestCode = if (requestCode == 29999) 20000 else requestCode + 1
        pending[requestCode] = continuation
        continuation.invokeOnCancellation {
          activity.runOnUiThread { pending.remove(requestCode) }
        }
        try {
          val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = mimeType
            putExtra(Intent.EXTRA_TITLE, fileName)
          }
          activity.startActivityForResult(intent, requestCode)
        } catch (error: Exception) {
          pending.remove(requestCode)
          continuation.resumeWithException(error)
        }
      }
    }

  fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?): Boolean {
    if (requestCode !in 20000..29999) return false
    pending.remove(requestCode)?.let {
      if (it.isActive) it.resume(if (resultCode == Activity.RESULT_OK) data?.data else null)
    }
    return true
  }

  fun cancelAll() {
    val continuations = pending.values.toList()
    pending.clear()
    continuations.forEach { it.cancel() }
  }
}
