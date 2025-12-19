package expo.modules.noraview

import android.net.Uri

val trackingParams = setOf(
  // instagram & reddit
  "utm_source",
  "utm_medium",
  "utm_name",
  "utm_term",
  "utm_content",
  // instagram
  "igsh",
  // threads
  "xmt"
)

fun removeTrackingParams(url: String): String {
  val uri = Uri.parse(url)
  val builder = uri.buildUpon().clearQuery()

  uri.queryParameterNames.forEach { key ->
    if (key !in trackingParams) {
      uri.getQueryParameters(key).forEach { value ->
        builder.appendQueryParameter(key, value)
      }
    }
  }

  return builder.build().toString()
}
