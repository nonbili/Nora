#!/usr/bin/env bun

import { resolve } from 'node:path'
import {
  commandExists,
  copyFile,
  ensureFile,
  envFlag,
  fail,
  packageInfo,
  repoRoot,
  run,
} from './release-utils'

const [trackArg, aabArg] = Bun.argv.slice(2)
const pkg = await packageInfo()
const track = trackArg ?? process.env.GOOGLE_PLAY_TRACK ?? 'production'
const aabPath = aabArg ?? process.env.AAB_PATH ?? resolve(repoRoot, 'android/app/build/outputs/bundle/release/app-release.aab')
const packageName = process.env.ANDROID_PACKAGE_NAME ?? 'jp.nonbili.nora'
const jsonKey = process.env.GOOGLE_PLAY_JSON_KEY ?? process.env.SUPPLY_JSON_KEY
const jsonKeyData = process.env.GOOGLE_PLAY_JSON_KEY_DATA ?? process.env.SUPPLY_JSON_KEY_DATA
const uploadChangelogs = envFlag('GOOGLE_PLAY_UPLOAD_CHANGELOGS', true)
const changelogPath = process.env.GOOGLE_PLAY_CHANGELOG
  ?? resolve(repoRoot, `metadata/en-US/changelogs/${pkg.versionCode}04.txt`)
// Google Play needs its own metadata tree with valid Play locale codes, separate
// from the repo-root F-Droid `metadata/` (whose locale names Play rejects). Only the
// en-US changelog is published, generated here from the F-Droid changelog source.
const playMetadataPath = resolve(repoRoot, 'fastlane/metadata/android')
const playChangelogPath = resolve(playMetadataPath, `en-US/changelogs/${pkg.versionCode}04.txt`)

if (!jsonKey && !jsonKeyData) {
  fail('set GOOGLE_PLAY_JSON_KEY or SUPPLY_JSON_KEY to your Google Play service account JSON path. You may also set GOOGLE_PLAY_JSON_KEY_DATA or SUPPLY_JSON_KEY_DATA for JSON content.')
}

if (jsonKey) {
  await ensureFile(jsonKey, `Google Play service account JSON not found: ${jsonKey}`)
}

if (!(await commandExists('bundle'))) {
  fail("bundle not found. Install bundler and run 'bundle install'.")
}

if (uploadChangelogs) {
  await ensureFile(
    changelogPath,
    `Android changelog not found: ${changelogPath}\n       Expected the current versionCode changelog at metadata/en-US/changelogs/${pkg.versionCode}04.txt.`,
  )
  await copyFile(changelogPath, playChangelogPath)
  console.log(`Using Google Play changelog ${changelogPath}`)
}

if (envFlag('PREBUILD', !envFlag('SKIP_BUILD', false))) {
  console.log('Running clean Expo prebuild for Android with Google Play signing config...')
  await run(['npx', 'expo', 'prebuild', '--platform', 'android', '--clean', '--no-install'], {
    env: { GOOGLE_PLAY_BUILD: '1' },
  })
}

if (!envFlag('SKIP_BUILD', false)) {
  const gradleArgs = ['bundleRelease']
  for (const name of ['NB_UPLOAD_STORE_FILE', 'NB_UPLOAD_STORE_PASSWORD', 'NB_UPLOAD_KEY_ALIAS', 'NB_UPLOAD_KEY_PASSWORD']) {
    const value = process.env[name]
    if (value) {
      gradleArgs.push(`-P${name}=${value}`)
    }
  }

  console.log('Building Android release bundle...')
  await run(['./gradlew', ...gradleArgs], {
    cwd: resolve(repoRoot, 'android'),
    env: { GOOGLE_PLAY_BUILD: '1' },
  })
}

await ensureFile(aabPath, `AAB not found: ${aabPath}`)

console.log(`Uploading ${aabPath} to Google Play track '${track}' for ${packageName}...`)
await run(['bundle', 'exec', 'fastlane', 'android', 'upload_aab'], {
  env: {
    ANDROID_PACKAGE_NAME: packageName,
    AAB_PATH: aabPath,
    GOOGLE_PLAY_TRACK: track,
    GOOGLE_PLAY_METADATA_PATH: playMetadataPath,
    GOOGLE_PLAY_UPLOAD_CHANGELOGS: uploadChangelogs ? '1' : '0',
  },
})

console.log('Done.')
