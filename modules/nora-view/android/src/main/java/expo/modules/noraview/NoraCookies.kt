package expo.modules.noraview

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.webkit.CookieManager
import androidx.webkit.ProfileStore
import androidx.webkit.WebViewFeature
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import kotlin.coroutines.resume

// WebView has no API to enumerate cookies, so read Chromium's cookie store directly.
// Values are stored in plain text on Android; anything Chromium chose to encrypt is skipped.
object NoraCookies {
  private const val WEBVIEW_DIR = "webview"
  private const val DEFAULT_PROFILE_DIR = "Default"
  private const val COOKIES_DB = "Cookies"
  private const val PREF_STORE = "pref_store"

  // Chromium timestamps are microseconds since 1601-01-01.
  private const val WINDOWS_EPOCH_OFFSET_SECONDS = 11644473600L

  private const val PROBE_URL = "https://nora-cookie-probe.invalid/"

  private val profileDirs = mutableMapOf<String, File>()

  suspend fun getProfileCookies(context: Context, profile: String, log: (String) -> Unit): List<Map<String, Any>> {
    flush(profile)
    val dir = resolveProfileDir(context, profile, log) ?: return emptyList()
    return withContext(Dispatchers.IO) { readCookies(context, dir, log) }
  }

  // WebView APIs, ProfileStore included, are only safe to touch on the UI thread.
  private suspend fun cookieManager(profile: String): CookieManager? = withContext(Dispatchers.Main) {
    if (profile != "default" && WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
      ProfileStore.getInstance().getProfile(profile)?.cookieManager
    } else {
      CookieManager.getInstance()
    }
  }

  private suspend fun flush(profile: String) {
    val manager = cookieManager(profile) ?: return
    withContext(Dispatchers.Main) { manager.flush() }
  }

  private suspend fun resolveProfileDir(context: Context, profile: String, log: (String) -> Unit): File? {
    val root = context.getDir(WEBVIEW_DIR, Context.MODE_PRIVATE)
    if (profile == "default") {
      return File(root, DEFAULT_PROFILE_DIR).takeIf { File(it, COOKIES_DB).exists() }
    }

    profileDirs[profile]?.let { cached ->
      if (File(cached, COOKIES_DB).exists()) return cached
      profileDirs.remove(profile)
    }

    dirFromPrefStore(root, profile)?.let { dir ->
      profileDirs[profile] = dir
      return dir
    }

    val manager = cookieManager(profile) ?: return null

    // Chromium only documents the mapping in its own prefs, so fall back to tagging the store
    // with a throwaway cookie and finding the database that contains it.
    val marker = "__nora_probe_${System.nanoTime()}"
    return try {
      writeProbe(manager, "$marker=1; path=/; max-age=60")
      val candidates = root.listFiles()
        ?.filter { it.isDirectory && it.name != DEFAULT_PROFILE_DIR && File(it, COOKIES_DB).exists() }
        .orEmpty()
      withContext(Dispatchers.IO) {
        candidates.firstOrNull { dir -> readCookies(context, dir, log).any { it["name"] == marker } }
      }?.also { profileDirs[profile] = it }
    } catch (e: Exception) {
      log("resolveProfileDir failed: ${e.message}")
      null
    } finally {
      runCatching { writeProbe(manager, "$marker=; path=/; max-age=0") }
    }
  }

  // pref_store keeps {"profile": {"list": [{"name": ..., "path": ...}]}}.
  private fun dirFromPrefStore(root: File, profile: String): File? = runCatching {
    val prefs = JSONObject(File(root, PREF_STORE).readText())
    val list = prefs.getJSONObject("profile").getJSONArray("list")
    (0 until list.length())
      .map { list.getJSONObject(it) }
      .firstOrNull { it.optString("name") == profile }
      ?.optString("path")
      ?.takeIf { it.isNotEmpty() }
      ?.let { File(root, it) }
      ?.takeIf { File(it, COOKIES_DB).exists() }
  }.getOrNull()

  private suspend fun writeProbe(manager: CookieManager, value: String) = withContext(Dispatchers.Main) {
    suspendCancellableCoroutine { continuation ->
      manager.setCookie(PROBE_URL, value) {
        manager.flush()
        continuation.resume(Unit)
      }
    }
  }

  private fun readCookies(context: Context, dir: File, log: (String) -> Unit): List<Map<String, Any>> {
    val source = File(dir, COOKIES_DB)
    if (!source.exists()) return emptyList()

    // Chromium keeps the database open, so query a copy instead of the live file.
    val copy = File(context.cacheDir, "nora-cookies-${System.nanoTime()}.db")
    val sidecars = listOf("$COOKIES_DB-journal", "$COOKIES_DB-wal", "$COOKIES_DB-shm")
    return try {
      source.copyTo(copy, overwrite = true)
      sidecars.forEach { name ->
        val sidecar = File(dir, name)
        if (sidecar.exists()) {
          sidecar.copyTo(File(copy.parentFile, copy.name + name.removePrefix(COOKIES_DB)), overwrite = true)
        }
      }
      queryCookies(copy)
    } catch (e: Exception) {
      log("readCookies failed: ${e.message}")
      emptyList()
    } finally {
      copy.delete()
      sidecars.forEach { name -> File(copy.parentFile, copy.name + name.removePrefix(COOKIES_DB)).delete() }
    }
  }

  private fun queryCookies(db: File): List<Map<String, Any>> {
    val cookies = mutableListOf<Map<String, Any>>()
    // Opened read-write so SQLite can roll back a hot journal left behind by the copy.
    SQLiteDatabase.openDatabase(db.path, null, SQLiteDatabase.OPEN_READWRITE).use { database ->
      val sql = "SELECT host_key, name, value, encrypted_value, path, expires_utc, is_secure, is_httponly FROM cookies"
      database.rawQuery(sql, null).use { cursor ->
        while (cursor.moveToNext()) {
          val value = cursor.getString(2) ?: ""
          if (value.isEmpty() && !cursor.isNull(3) && cursor.getBlob(3).isNotEmpty()) {
            continue
          }
          val expires = cursor.getLong(5)
          cookies.add(
            mapOf(
              "domain" to (cursor.getString(0) ?: ""),
              "path" to (cursor.getString(4) ?: "/"),
              "secure" to (cursor.getInt(6) != 0),
              "httpOnly" to (cursor.getInt(7) != 0),
              "expires" to if (expires > 0) expires / 1_000_000 - WINDOWS_EPOCH_OFFSET_SECONDS else 0L,
              "name" to (cursor.getString(1) ?: ""),
              "value" to value,
            )
          )
        }
      }
    }
    return cookies
  }
}
