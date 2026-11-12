package expo.modules.noraview

/** Immutable request matcher; publish the whole snapshot to WebView's IO threads. */
internal class NoraBlockingState(
  val enabled: Boolean = false,
  blockedHosts: String = "",
  allowedHosts: String = "",
  cosmeticFilters: String = "",
  cosmeticExceptions: String = "",
) {
  private val blocked = decodeBlockingHosts(blockedHosts)
  private val allowed = decodeBlockingHosts(allowedHosts)
  val cosmetics = NoraCosmeticRules(cosmeticFilters, cosmeticExceptions)

  fun shouldBlock(host: String?): Boolean {
    if (!enabled || host == null) return false
    val parts = host.lowercase().split(".")
    var blockIndex = -1
    var allowIndex = -1
    for (index in parts.indices) {
      val candidate = parts.drop(index).joinToString(".")
      if (blockIndex == -1 && candidate in blocked) blockIndex = index
      if (allowIndex == -1 && candidate in allowed) allowIndex = index
    }
    return blockIndex != -1 && (allowIndex == -1 || allowIndex > blockIndex)
  }
}

internal fun decodeBlockingHosts(value: String): Set<String> = value.lineSequence()
  .map { it.trim().lowercase() }.filter { it.isNotEmpty() }.toSet()

/** A slow disk restore must never overwrite a newer payload received from React. */
internal class NoraBlockingStateStore {
  @Volatile var current = NoraBlockingState()
    private set
  @Volatile var initialized = false
    private set

  @Synchronized fun restore(value: NoraBlockingState) {
    if (!initialized) {
      current = value
      initialized = true
    }
  }

  @Synchronized fun update(value: NoraBlockingState) {
    current = value
    initialized = true
  }
}

/** Parse domain conditions once, and cache only CSS for hosts actually visited. */
internal class NoraCosmeticRules(filters: String, exceptions: String) {
  private class Rule(val positive: List<String>, val negative: List<String>, val selector: String) {
    fun matches(hosts: Set<String>) = negative.none { it in hosts } &&
      (positive.isEmpty() || positive.any { it in hosts })
  }
  private fun parse(value: String): List<Rule> = value.lineSequence().mapNotNull { line ->
    val separator = if (line.contains("#@#")) "#@#" else "##"
    val index = line.indexOf(separator)
    if (index < 0) return@mapNotNull null
    val domains = line.take(index).split(',').map { it.trim().lowercase() }.filter { it.isNotEmpty() }
    Rule(domains.filterNot { it.startsWith("~") }, domains.filter { it.startsWith("~") }.map { it.drop(1) },
      line.substring(index + separator.length))
  }.toList()
  private val rules = parse(filters)
  private val exceptions = parse(exceptions)
  private val cache = object : LinkedHashMap<String, String>(32, 0.75f, true) {
    override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, String>?) = size > 32
  }

  @Synchronized fun cssForHost(host: String): String {
    val normalized = host.lowercase()
    cache[normalized]?.let { return it }
    val parts = normalized.split('.')
    val hosts = parts.indices.map { parts.drop(it).joinToString(".") }.toSet()
    val excluded = exceptions.filter { it.matches(hosts) }.map { it.selector }.toSet()
    val css = rules.filter { it.matches(hosts) && it.selector !in excluded }
      .joinToString("\n") { "${it.selector}{display:none!important;}" }
    cache[normalized] = css
    return css
  }
}
