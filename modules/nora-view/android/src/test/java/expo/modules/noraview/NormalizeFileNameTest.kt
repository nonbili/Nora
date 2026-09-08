package expo.modules.noraview

import org.junit.Assert.assertEquals
import org.junit.Test

// Stands in for the framework's MimeTypeMap; only the types the cases below
// rely on are registered.
private val testMimeTypes = object : MimeTypeLookup {
  val extensions = mapOf(
    "png" to "image/png",
    "gif" to "image/gif",
    "jpg" to "image/jpeg",
    "mp4" to "video/mp4",
    "csv" to "text/csv",
    "txt" to "text/plain",
  )

  override fun mimeTypeFor(extension: String) = extensions[extension]

  override fun extensionFor(mimeType: String) =
    extensions.entries.firstOrNull { it.value == mimeType }?.key
}

private fun normalize(name: String, mimeType: String?, detected: Boolean = false) =
  normalizeFileName(name, mimeType, detected, testMimeTypes)

class NormalizeFileNameTest {
  // The context menu can only guess at the type of the image it is saving.
  @Test
  fun mapsDecoyExtensionsWhenTheMimeTypeIsOnlyAGuess() {
    assertEquals("image.png", normalize("image.pnj", "image/jpeg"))
    assertEquals("image.gif", normalize("image.gifv", "image/jpeg"))
    assertEquals("IMAGE.png", normalize("IMAGE.PNJ", "image/jpeg"))
  }

  @Test
  fun fillsInAMissingExtensionFromTheMimeType() {
    assertEquals("Fm2xQ.jpg", normalize("Fm2xQ", "image/jpeg"))
    assertEquals("Fm2xQ", normalize("Fm2xQ", null))
  }

  @Test
  fun keepsAnExtensionAndroidRecognizes() {
    assertEquals("photo.png", normalize("photo.png", "image/jpeg"))
    assertEquals("clip.mp4", normalize("clip.mp4", null))
  }

  // An extension Android does not know may still be one the user's app knows.
  @Test
  fun keepsAnUnrecognizedExtension() {
    assertEquals("export.myapp", normalize("export.myapp", "text/plain", detected = true))
    assertEquals("export.myapp", normalize("export.myapp", null))
  }

  // Imgur's .gifv holds an MP4, so the bytes overrule the alias table.
  @Test
  fun prefersADetectedMimeTypeOverTheAliasTable() {
    assertEquals("clip.mp4", normalize("clip.gifv", "video/mp4", detected = true))
  }

  @Test
  fun renamesWhenDetectedBytesContradictTheName() {
    assertEquals("clip.mp4", normalize("clip.gif", "video/mp4", detected = true))
  }

  // Sniffing reads a .csv as text/plain; that is not a contradiction.
  @Test
  fun ignoresADetectedMimeTypeOfTheSameKind() {
    assertEquals("rows.csv", normalize("rows.csv", "text/plain", detected = true))
  }
}
