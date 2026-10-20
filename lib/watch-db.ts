import { observable } from '@legendapp/state'
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite'
import type { WatchPost } from '@/lib/watch'

/**
 * The posts of watched profiles, in a database of their own rather than with the profiles: there
 * are many of them, and a view reads only those it shows. A post two watched profiles share is
 * kept once for each, as each profile's list has it.
 */

// Goes up with each change to the posts, so what shows them reads them again.
export const watchPostsVersion$ = observable(0)

const changed = () => watchPostsVersion$.set((version) => version + 1)

let database: SQLiteDatabase | undefined

const db = () => {
  if (!database) {
    database = openDatabaseSync('watch.db')
    // The background check writes while the feed reads.
    database.execSync('PRAGMA journal_mode = WAL')
    const version = database.getFirstSync<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0
    if (version < 1) {
      database.execSync(`
        CREATE TABLE IF NOT EXISTS posts (
          profile_key TEXT NOT NULL,
          key TEXT NOT NULL,
          created_at_ms INTEGER NOT NULL,
          first_seen_at INTEGER NOT NULL,
          data TEXT NOT NULL,
          PRIMARY KEY (profile_key, key)
        ) WITHOUT ROWID;
        CREATE INDEX IF NOT EXISTS posts_profile_created ON posts (profile_key, created_at_ms DESC);
        CREATE INDEX IF NOT EXISTS posts_key ON posts (key);
        CREATE INDEX IF NOT EXISTS posts_created ON posts (created_at_ms DESC);
        PRAGMA user_version = 1;
      `)
    }
  }
  return database
}

const parse = (rows: { data: string }[]): WatchPost[] => rows.map((row) => JSON.parse(row.data))

const insert = (profileKey: string, post: WatchPost) =>
  db().runSync(
    'INSERT OR REPLACE INTO posts (profile_key, key, created_at_ms, first_seen_at, data) VALUES (?, ?, ?, ?, ?)',
    [profileKey, post.key, post.createdAtMs, post.firstSeenAt, JSON.stringify(post)],
  )

/** The posts kept of one profile, newest first. */
export const getProfilePosts = (profileKey: string): WatchPost[] =>
  parse(db().getAllSync('SELECT data FROM posts WHERE profile_key = ? ORDER BY created_at_ms DESC', [profileKey]))

/** Puts these in place of what was kept of the profile. */
export const setProfilePosts = (profileKey: string, posts: WatchPost[]) => {
  db().withTransactionSync(() => {
    db().runSync('DELETE FROM posts WHERE profile_key = ?', [profileKey])
    for (const post of posts) insert(profileKey, post)
  })
  changed()
}

export const deleteProfilePosts = (profileKey: string) => {
  db().runSync('DELETE FROM posts WHERE profile_key = ?', [profileKey])
  changed()
}

/** Lets each profile keep no more than its latest posts. */
export const trimWatchPosts = (max: number) => {
  const { changes } = db().runSync(
    `DELETE FROM posts WHERE (profile_key, key) IN (
      SELECT profile_key, key FROM (
        SELECT profile_key, key,
          ROW_NUMBER() OVER (PARTITION BY profile_key ORDER BY created_at_ms DESC) AS place
        FROM posts
      ) WHERE place > ?
    )`,
    [max],
  )
  if (changes) changed()
}

/** Adds the posts of several profiles at once, as those kept before the database. */
export const importWatchPosts = (byProfile: Record<string, WatchPost[] | undefined>) => {
  db().withTransactionSync(() => {
    for (const [profileKey, posts] of Object.entries(byProfile)) {
      for (const post of posts || []) insert(profileKey, post)
    }
  })
  changed()
}

/** The copy of a post the profile has, or else of any profile. */
export const findWatchPost = (profileKey: string, key: string): WatchPost | undefined => {
  const row = db().getFirstSync<{ data: string }>(
    'SELECT data FROM posts WHERE key = ? ORDER BY profile_key = ? DESC LIMIT 1',
    [key, profileKey],
  )
  return row ? JSON.parse(row.data) : undefined
}

/** Changes the copy of a post one profile has. */
export const updateWatchPost = (profileKey: string, key: string, patch: Partial<WatchPost>) => {
  const row = db().getFirstSync<{ data: string }>('SELECT data FROM posts WHERE profile_key = ? AND key = ?', [
    profileKey,
    key,
  ])
  if (!row) return
  insert(profileKey, { ...JSON.parse(row.data), ...patch, key })
  changed()
}

// A post with photos or videos, or whose media is still to be read; a cover alone, as of a link, is not.
const HAS_MEDIA = `(json_array_length(p.data, '$.media') > 0 OR json_extract(p.data, '$.mediaComplete') = 0)`

/**
 * The newest posts of these profiles as one list, up to the limit. A post two of them share, as a
 * collaboration on Instagram, is shown once, as the first of them has it.
 */
export const getFeedPosts = (profileKeys: string[], limit: number, mediaOnly = false): WatchPost[] =>
  parse(
    db().getAllSync(
      `SELECT data FROM (
        SELECT p.data, p.created_at_ms, w.key AS rank,
          ROW_NUMBER() OVER (PARTITION BY p.key ORDER BY w.key) AS copy
        FROM posts p JOIN json_each(?) w ON w.value = p.profile_key
        ${mediaOnly ? `WHERE ${HAS_MEDIA}` : ''}
      )
      WHERE copy = 1
      ORDER BY created_at_ms DESC, rank
      LIMIT ?`,
      [JSON.stringify(profileKeys), limit],
    ),
  )

/**
 * The posts of these profiles not shown yet: first seen after a tab last showed one of the profiles
 * that have it, whichever view that was.
 */
export const getUnreadPostKeys = (
  profileKeys: string[],
  seenAtByProfile: Record<string, number>,
  defaultSeenAt: number,
  mediaOnly = false,
): Set<string> => {
  // Every profile is looked at: a post these share with another was read where that other was shown.
  const rows = db().getAllSync<{ key: string }>(
    `WITH seen (profile_key, seen_at) AS (SELECT key, value FROM json_each(?1))
    SELECT DISTINCT p.key FROM posts p LEFT JOIN seen s USING (profile_key)
    WHERE p.profile_key IN (SELECT value FROM json_each(?2))
      AND p.first_seen_at > COALESCE(s.seen_at, ?3)
      ${mediaOnly ? `AND ${HAS_MEDIA}` : ''}
      AND NOT EXISTS (
        SELECT 1 FROM posts r LEFT JOIN seen rs USING (profile_key)
        WHERE r.key = p.key AND r.first_seen_at <= COALESCE(rs.seen_at, ?3)
      )`,
    [JSON.stringify(seenAtByProfile), JSON.stringify(profileKeys), defaultSeenAt],
  )
  return new Set(rows.map((row) => row.key))
}

/** These posts in the order asked for, each as findWatchPost finds it; those no longer kept are left out. */
export const findWatchPosts = (refs: { profileKey: string; key: string }[]): WatchPost[] =>
  parse(
    db().getAllSync<{ data: string | null }>(
      `SELECT (
        SELECT p.data FROM posts p WHERE p.key = json_extract(w.value, '$.key')
        ORDER BY p.profile_key = json_extract(w.value, '$.profileKey') DESC LIMIT 1
      ) AS data
      FROM json_each(?) w ORDER BY w.key`,
      [JSON.stringify(refs.map(({ profileKey, key }) => ({ profileKey, key })))],
    ).filter((row): row is { data: string } => row.data !== null),
  )

/** The profiles with a post among these, or first seen after the time, when there is one. */
export const getProfilesWithPosts = (keys: Iterable<string>, seenAfter: number): Set<string> => {
  const rows = db().getAllSync<{ profile_key: string }>(
    `SELECT DISTINCT profile_key FROM posts
    WHERE key IN (SELECT value FROM json_each(?)) OR (? > 0 AND first_seen_at > ?)`,
    [JSON.stringify([...keys]), seenAfter, seenAfter],
  )
  return new Set(rows.map((row) => row.profile_key))
}

/** When each profile's newest kept post was made. */
export const getNewestPostTimes = (): Record<string, number> =>
  Object.fromEntries(
    db()
      .getAllSync<{ profile_key: string; newest: number }>(
        'SELECT profile_key, MAX(created_at_ms) AS newest FROM posts GROUP BY profile_key',
      )
      .map((row) => [row.profile_key, row.newest]),
  )

/** The keys of all the posts kept, of any profile. */
export const getWatchPostKeys = (): Set<string> =>
  new Set(db().getAllSync<{ key: string }>('SELECT DISTINCT key FROM posts').map((row) => row.key))

/** A page of all the posts kept, newest first; a post two profiles share comes once for each. */
export const getPostsNewestFirst = (limit: number, offset: number): WatchPost[] =>
  parse(db().getAllSync('SELECT data FROM posts ORDER BY created_at_ms DESC, key LIMIT ? OFFSET ?', [limit, offset]))
