/**
 * Writes lib/emoji-data.json from unicode-emoji-json: each group's emojis with only what the picker
 * uses, their name and the emoji version that brought them, a fraction of the package's size.
 *
 *   bun scripts/gen-emoji-data.ts
 */

import groups from 'unicode-emoji-json/data-by-group.json'

const data = groups.map((group) => ({
  slug: group.slug,
  emojis: group.emojis.map((emoji) => [emoji.emoji, emoji.name, parseFloat(emoji.emoji_version)] as const),
}))

await Bun.write(new URL('../lib/emoji-data.json', import.meta.url), JSON.stringify(data) + '\n')
console.log(`lib/emoji-data.json: ${data.reduce((sum, group) => sum + group.emojis.length, 0)} emojis`)
