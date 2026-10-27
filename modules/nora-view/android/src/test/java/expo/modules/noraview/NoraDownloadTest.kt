package expo.modules.noraview

import java.io.ByteArrayOutputStream
import java.io.Closeable
import java.io.IOException
import java.net.ServerSocket
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.fail
import org.junit.Test

private class DownloadTestServer(
  requestCount: Int,
  response: (String) -> ByteArray
) : Closeable {
  private val server = ServerSocket(0, 10, java.net.InetAddress.getByName("127.0.0.1"))
  private val executor = Executors.newSingleThreadExecutor()
  val url = "http://127.0.0.1:${server.localPort}"
  val requests = mutableListOf<Map<String, String>>()
  private val task = executor.submit {
    repeat(requestCount) {
      server.accept().use { socket ->
        socket.soTimeout = 5000
        val input = socket.getInputStream().bufferedReader()
        val path = input.readLine().split(" ")[1]
        val headers = mutableMapOf("path" to path)
        while (true) {
          val line = input.readLine() ?: break
          if (line.isEmpty()) break
          headers[line.substringBefore(':').lowercase()] = line.substringAfter(':').trim()
        }
        requests.add(headers)
        socket.getOutputStream().write(response(path))
      }
    }
  }

  fun await() { task.get(5, TimeUnit.SECONDS) }

  override fun close() {
    server.close()
    executor.shutdownNow()
  }
}

class NoraDownloadTest {
  @Test
  fun streamsBinaryFilesWithBrowserHeadersAndCookiesForEachRedirect() {
    val bytes = byteArrayOf(0, 1, 2, -1, 0, -128)
    DownloadTestServer(2) { path ->
      if (path == "/start") {
        "HTTP/1.1 302 Found\r\nLocation: /file\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray()
      } else {
        "HTTP/1.1 200 OK\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n".toByteArray() + bytes
      }
    }.use { server ->
      val output = ByteArrayOutputStream()
      copyDownload("${server.url}/start", "Nora test", "https://example.com/", {
        if (it.endsWith("/start")) "session=original" else "session=redirected"
      }) { output }
      server.await()
      assertArrayEquals(bytes, output.toByteArray())
      assertEquals(listOf(
        listOf("/start", "Nora test", "https://example.com/", "session=original"),
        listOf("/file", "Nora test", "https://example.com/", "session=redirected")
      ), server.requests.map { listOf(it["path"], it["user-agent"], it["referer"], it["cookie"]) })
    }
  }

  @Test
  fun rejectsHttpErrorsBeforeWritingTheDestination() {
    DownloadTestServer(1) {
      "HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray()
    }.use { server ->
      assertThrows(IOException::class.java) {
        copyDownload(server.url, "Nora", null, { null }) {
          fail("An HTTP error must not be saved as a file")
          ByteArrayOutputStream()
        }
      }
      server.await()
    }
  }

  @Test
  fun rejectsNonHttpDownloads() {
    assertThrows(IllegalArgumentException::class.java) {
      copyDownload("file:///etc/hosts", "Nora", null, { null }) { ByteArrayOutputStream() }
    }
  }
}
