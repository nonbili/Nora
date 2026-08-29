package expo.modules.noraview

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.net.Uri
import android.util.Base64
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

// Pins a tab as its own document-style activity, separate from Nora's main browser task.
object NoraShortcuts {
  private const val MAX_LABEL_LENGTH = 48
  private const val MAX_ICON_BYTES = 512 * 1024
  private const val ICON_TIMEOUT_MS = 5000
  private const val FALLBACK_ICON_SIZE = 192
  private const val MIN_CANVAS_SIZE = 256
  private const val MIN_SHARP_ICON_SIZE = 96

  // Android only guarantees the centre 66/108 of an adaptive icon will survive every
  // launcher mask. Leave a little breathing room inside that area for the actual glyph.
  private const val ICON_SAFE_ZONE = 0.58f
  private const val BACKGROUND_TOLERANCE = 24

  fun isSupported(context: Context): Boolean =
    try {
      ShortcutManagerCompat.isRequestPinShortcutSupported(context)
    } catch (e: Exception) {
      false
    }

  fun pinTab(
    context: Context,
    id: String,
    url: String,
    label: String,
    iconUrl: String?,
    manifestUrl: String?,
    profile: String,
    userAgent: String,
    log: (String) -> Unit,
  ): Boolean {
    if (!isSupported(context)) {
      return false
    }

    val shortLabel = label.trim().ifEmpty { "Nora" }.take(MAX_LABEL_LENGTH)
    val intent = Intent(context, NoraStandaloneActivity::class.java).apply {
      action = Intent.ACTION_VIEW
      data = Uri.parse(url)
      putExtra(NoraStandaloneActivity.EXTRA_LABEL, shortLabel)
      putExtra(NoraStandaloneActivity.EXTRA_PROFILE, profile)
      putExtra(NoraStandaloneActivity.EXTRA_USER_AGENT, userAgent)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NEW_DOCUMENT)
    }

    return try {
      val shortcut = ShortcutInfoCompat.Builder(context, "tab-$id")
        .setShortLabel(shortLabel)
        .setLongLabel(shortLabel)
        .setIcon(buildIcon(context, url, iconUrl, manifestUrl, log))
        .setIntent(intent)
        .build()
      // A tab may already be pinned. Pixel Launcher reuses the stored bitmap for a
      // repeated request with the same ID unless the existing shortcut is updated first.
      ShortcutManagerCompat.updateShortcuts(context, listOf(shortcut))
      ShortcutManagerCompat.requestPinShortcut(context, shortcut, null)
    } catch (e: Exception) {
      log("requestPinShortcut failed: ${e.message}")
      false
    }
  }

  private fun buildIcon(
    context: Context,
    pageUrl: String,
    iconUrl: String?,
    manifestUrl: String?,
    log: (String) -> Unit,
  ): IconCompat {
    val size = launcherIconSize(context)
    val manifestIcon = manifestUrl?.takeIf { it.isNotEmpty() }?.let { loadManifestBitmap(it, size, log) }
    if (manifestIcon != null) {
      composeIcon(size, manifestIcon.first, preserveCanvas = true)?.let {
        return if (manifestIcon.second) IconCompat.createWithAdaptiveBitmap(it) else IconCompat.createWithBitmap(it)
      }
    }
    val favicon = iconUrl?.takeIf { it.isNotEmpty() }?.let { loadBestBitmap(pageUrl, it, size, log) }
    if (favicon != null) {
      composeIcon(size, favicon)?.let { return IconCompat.createWithAdaptiveBitmap(it) }
    }
    return IconCompat.createWithResource(context, context.applicationInfo.icon)
  }

  private fun composeIcon(size: Int, favicon: Bitmap, preserveCanvas: Boolean = false): Bitmap? =
    try {
      val output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
      val canvas = Canvas(output)
      if (preserveCanvas) {
        canvas.drawBitmap(
          favicon,
          Rect(0, 0, favicon.width, favicon.height),
          Rect(0, 0, size, size),
          Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG),
        )
      } else {
        val backgroundColor = backgroundColorFor(favicon)
        canvas.drawColor(backgroundColor)

        val box = (size * ICON_SAFE_ZONE).toInt()
        val source = contentBoundsFor(favicon, backgroundColor)
        val longestEdge = maxOf(source.width(), source.height()).coerceAtLeast(1)
        val scale = box.toFloat() / longestEdge
        val width = (source.width() * scale).toInt().coerceAtLeast(1)
        val height = (source.height() * scale).toInt().coerceAtLeast(1)
        val left = (size - width) / 2
        val top = (size - height) / 2
        canvas.drawBitmap(
          favicon,
          source,
          Rect(left, top, left + width, top + height),
          Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG),
        )
      }
      output
    } catch (e: Exception) {
      null
    }

  // Touch icons commonly bake a large border into the bitmap. Scaling that complete
  // square into Android's safe zone makes the glyph tiny, so trim only pixels matching
  // the edge background. The same pass also removes transparent margins.
  private fun contentBoundsFor(favicon: Bitmap, backgroundColor: Int): Rect {
    val edgeIsTransparent = hasTransparentEdge(favicon)
    var left = favicon.width
    var top = favicon.height
    var right = -1
    var bottom = -1

    for (y in 0 until favicon.height) {
      for (x in 0 until favicon.width) {
        val pixel = favicon.getPixel(x, y)
        val isContent = if (edgeIsTransparent) {
          Color.alpha(pixel) > BACKGROUND_TOLERANCE
        } else {
          Color.alpha(pixel) > BACKGROUND_TOLERANCE && colorDistance(pixel, backgroundColor) > BACKGROUND_TOLERANCE
        }
        if (isContent) {
          left = minOf(left, x)
          top = minOf(top, y)
          right = maxOf(right, x)
          bottom = maxOf(bottom, y)
        }
      }
    }

    return if (right >= left && bottom >= top) {
      Rect(left, top, right + 1, bottom + 1)
    } else {
      Rect(0, 0, favicon.width, favicon.height)
    }
  }

  private fun hasTransparentEdge(favicon: Bitmap): Boolean {
    val lastX = favicon.width - 1
    val lastY = favicon.height - 1
    if (lastX < 0 || lastY < 0) {
      return false
    }
    return listOf(
      0 to 0,
      lastX to 0,
      0 to lastY,
      lastX to lastY,
      lastX / 2 to 0,
      lastX / 2 to lastY,
      0 to lastY / 2,
      lastX to lastY / 2,
    ).any { (x, y) -> Color.alpha(favicon.getPixel(x, y)) <= 200 }
  }

  private fun colorDistance(first: Int, second: Int): Int =
    maxOf(
      kotlin.math.abs(Color.red(first) - Color.red(second)),
      kotlin.math.abs(Color.green(first) - Color.green(second)),
      kotlin.math.abs(Color.blue(first) - Color.blue(second)),
    )

  private fun launcherIconSize(context: Context): Int {
    val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
    val size = manager?.launcherLargeIconSize?.takeIf { it > 0 } ?: FALLBACK_ICON_SIZE
    // Only half the canvas carries the favicon, so a canvas at the launcher's icon size
    // would hand it an already-downscaled glyph to scale again.
    return maxOf(size, MIN_CANVAS_SIZE)
  }

  // A favicon is drawn for its own background: a white plate behind a dark glyph reads as
  // a sticker with pale corners once the launcher masks it. Taking the colour the favicon
  // already carries at its edges makes the plate disappear into the icon instead.
  private fun backgroundColorFor(favicon: Bitmap): Int {
    val lastX = favicon.width - 1
    val lastY = favicon.height - 1
    if (lastX < 0 || lastY < 0) {
      return Color.WHITE
    }
    val samples = listOf(
      0 to 0,
      lastX to 0,
      0 to lastY,
      lastX to lastY,
      lastX / 2 to 0,
      lastX / 2 to lastY,
      0 to lastY / 2,
      lastX to lastY / 2,
    ).map { (x, y) -> favicon.getPixel(x, y) }

    val opaque = samples.filter { Color.alpha(it) > 200 }
    if (opaque.size < samples.size) {
      // Transparent edges mean the favicon expects the surface behind it to show through.
      return Color.WHITE
    }
    val dominant = opaque.groupingBy { it }.eachCount().maxByOrNull { it.value } ?: return Color.WHITE
    return if (dominant.value * 2 >= opaque.size) dominant.key else Color.WHITE
  }

  // Most favicons are 16 or 32 pixels, which is a 4-8x upscale on a launcher icon and
  // looks like it. A site's touch icon is the same artwork at 180 pixels, so it is worth
  // one extra request when the declared favicon comes back that small.
  private fun loadBestBitmap(pageUrl: String, iconUrl: String, targetSize: Int, log: (String) -> Unit): Bitmap? {
    val favicon = loadBitmap(iconUrl, targetSize, log)
    val faviconEdge = favicon?.let { maxOf(it.width, it.height) } ?: 0
    if (faviconEdge >= MIN_SHARP_ICON_SIZE) {
      return favicon
    }
    for (candidate in touchIconUrls(pageUrl)) {
      val touchIcon = loadBitmap(candidate, targetSize, log, requireImage = true) ?: continue
      if (maxOf(touchIcon.width, touchIcon.height) > faviconEdge) {
        return touchIcon
      }
    }
    // Some sites publish only a tiny favicon and no useful touch icon. Ask the same
    // high-resolution favicon service used by Nora search before accepting a blurry
    // upscale; first-party manifest and icon assets always remain preferred.
    highResolutionFaviconUrl(pageUrl)?.let { candidate ->
      val highResolutionIcon = loadBitmap(candidate, targetSize, log, requireImage = true)
      if (highResolutionIcon != null && maxOf(highResolutionIcon.width, highResolutionIcon.height) > faviconEdge) {
        return highResolutionIcon
      }
    }
    return favicon
  }

  private fun highResolutionFaviconUrl(pageUrl: String): String? =
    try {
      val url = URL(pageUrl)
      if (url.protocol != "http" && url.protocol != "https") {
        null
      } else {
        val origin = "${url.protocol}://${url.authority}"
        "https://www.google.com/s2/favicons?domain_url=${Uri.encode(origin)}&sz=256"
      }
    } catch (e: Exception) {
      null
    }

  // Manifest purpose describes how launchers should treat the pixels. "maskable" artwork
  // is a full-bleed adaptive foreground; "any" and unspecified icons are regular bitmaps.
  private fun loadManifestBitmap(manifestUrl: String, targetSize: Int, log: (String) -> Unit): Pair<Bitmap, Boolean>? =
    try {
      val bytes = download(manifestUrl) ?: return null
      val icons = JSONObject(bytes.toString(Charsets.UTF_8)).optJSONArray("icons") ?: return null
      val candidates = (0 until icons.length()).mapNotNull { index ->
        val icon = icons.optJSONObject(index) ?: return@mapNotNull null
        val src = icon.optString("src").takeIf { it.isNotEmpty() } ?: return@mapNotNull null
        val size = Regex("\\d+").findAll(icon.optString("sizes"))
          .map { it.value.toIntOrNull() ?: 0 }
          .maxOrNull() ?: 0
        Triple(size, URL(URL(manifestUrl), src).toString(), icon.optString("purpose").split(' ').contains("maskable"))
      }.sortedWith(compareByDescending<Triple<Int, String, Boolean>> { it.third }.thenByDescending { it.first })
      candidates.firstNotNullOfOrNull { (_, url, maskable) ->
        loadBitmap(url, targetSize, log, requireImage = true)?.let { it to maskable }
      }
    } catch (e: Exception) {
      log("shortcut manifest failed: ${e.message}")
      null
    }

  // Guessed from the page's own origin, never the favicon's: sites commonly serve their
  // favicon from a shared CDN, and that CDN's /apple-touch-icon.png belongs to whichever
  // sibling site owns the host (static.cdninstagram.com hands back Facebook's logo).
  private fun touchIconUrls(pageUrl: String): List<String> =
    try {
      val url = URL(pageUrl)
      if (url.protocol != "http" && url.protocol != "https") {
        emptyList()
      } else {
        listOf("apple-touch-icon.png", "apple-touch-icon-precomposed.png")
          .map { "${url.protocol}://${url.authority}/$it" }
      }
    } catch (e: Exception) {
      emptyList()
    }

  private fun loadBitmap(
    iconUrl: String,
    targetSize: Int,
    log: (String) -> Unit,
    requireImage: Boolean = false,
  ): Bitmap? =
    try {
      val bytes = when {
        iconUrl.startsWith("data:") -> decodeDataUri(iconUrl)
        iconUrl.startsWith("http://") || iconUrl.startsWith("https://") -> download(iconUrl, requireImage)
        else -> null
      }
      bytes?.let { decodeBitmap(it, targetSize) }
    } catch (e: Exception) {
      log("shortcut icon failed: ${e.message}")
      null
    } catch (e: OutOfMemoryError) {
      log("shortcut icon too large to decode")
      null
    }

  // The byte cap says nothing about the decoded size: a small, heavily compressed image
  // can still hold enormous dimensions, so read the bounds first and subsample down to
  // roughly the icon size instead of decoding it at full resolution.
  private fun decodeBitmap(bytes: ByteArray, targetSize: Int): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    val longestEdge = maxOf(bounds.outWidth, bounds.outHeight)
    if (longestEdge <= 0) {
      return null
    }
    var sampleSize = 1
    while (targetSize > 0 && longestEdge / (sampleSize * 2) >= targetSize) {
      sampleSize *= 2
    }
    val options = BitmapFactory.Options().apply { inSampleSize = sampleSize }
    return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
  }

  private fun decodeDataUri(uri: String): ByteArray? {
    val comma = uri.indexOf(',')
    if (comma == -1) {
      return null
    }
    val meta = uri.substring(0, comma)
    val payload = uri.substring(comma + 1)
    // Only base64 payloads are worth decoding here: a percent-encoded data URI is an SVG
    // in practice, which BitmapFactory cannot read anyway.
    if (!meta.contains(";base64")) {
      return null
    }
    return Base64.decode(payload, Base64.DEFAULT)
  }

  // requireImage is for the guessed touch-icon paths: a single-page app answers any
  // unknown path with its whole HTML shell, and there is no point streaming that in only
  // for BitmapFactory to reject it.
  private fun download(iconUrl: String, requireImage: Boolean = false): ByteArray? {
    val connection = URL(iconUrl).openConnection() as HttpURLConnection
    return try {
      connection.connectTimeout = ICON_TIMEOUT_MS
      connection.readTimeout = ICON_TIMEOUT_MS
      connection.instanceFollowRedirects = true
      connection.doInput = true
      connection.connect()
      if (connection.responseCode !in 200..299) {
        return null
      }
      if (requireImage && connection.contentType?.startsWith("image/") != true) {
        return null
      }
      val buffer = ByteArrayOutputStream()
      val chunk = ByteArray(8 * 1024)
      connection.inputStream.use { input ->
        while (true) {
          val read = input.read(chunk)
          if (read == -1) {
            break
          }
          buffer.write(chunk, 0, read)
          if (buffer.size() > MAX_ICON_BYTES) {
            return null
          }
        }
      }
      buffer.toByteArray()
    } finally {
      connection.disconnect()
    }
  }
}
