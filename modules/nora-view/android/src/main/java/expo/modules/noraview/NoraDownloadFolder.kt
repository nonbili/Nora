package expo.modules.noraview

import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import java.io.IOException

/** Writes downloads into the folder picked in Settings, a tree URI the app holds a persisted grant for. */
internal object NoraDownloadFolder {
  /** The grant is gone: the folder was removed, or the user revoked it from system settings. */
  class UnavailableException : IOException("Download folder access was lost")

  fun createDocument(context: Context, folder: String, fileName: String, mimeType: String): Uri {
    val tree = Uri.parse(folder)
    val resolver = context.contentResolver
    val hasAccess = DocumentsContract.isTreeUri(tree) &&
      resolver.persistedUriPermissions.any { it.uri == tree && it.isWritePermission }
    if (!hasAccess) throw UnavailableException()
    val parent = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree))
    // The provider renames on a name clash, as "name (1).ext".
    return try {
      DocumentsContract.createDocument(resolver, parent, mimeType, fileName)
    } catch (error: Exception) {
      if (error is SecurityException) throw UnavailableException()
      throw error
    } ?: throw IOException("Cannot create a file in the download folder")
  }

  fun failureMessageKey(error: Throwable): String =
    if (error is UnavailableException) "toast_downloadFolderUnavailable" else "toast_downloadFailed"
}
