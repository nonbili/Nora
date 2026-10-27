package expo.modules.noraview

import java.io.IOException
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL

/** Streams the response without buffering a video in memory. Cookies follow each redirect's host. */
internal fun copyDownload(
  url: String,
  userAgent: String,
  referer: String?,
  cookieForUrl: (String) -> String?,
  openOutput: () -> OutputStream
) {
  var target = URL(url)
  repeat(10) {
    require(target.protocol == "https" || target.protocol == "http") { "Unsupported download URL" }
    val connection = target.openConnection() as HttpURLConnection
    try {
      connection.instanceFollowRedirects = false
      connection.connectTimeout = 30000
      connection.readTimeout = 30000
      connection.setRequestProperty("User-Agent", userAgent)
      referer?.let { connection.setRequestProperty("Referer", it) }
      cookieForUrl(target.toString())?.let { connection.setRequestProperty("Cookie", it) }
      val status = connection.responseCode
      if (status in listOf(301, 302, 303, 307, 308)) {
        val location = connection.getHeaderField("Location") ?: throw IOException("Missing redirect location")
        target = URL(target, location)
      } else {
        if (status !in 200..299) throw IOException("Download returned HTTP $status")
        connection.inputStream.use { input ->
          openOutput().use { input.copyTo(it) }
        }
        return
      }
    } finally {
      connection.disconnect()
    }
  }
  throw IOException("Too many download redirects")
}
