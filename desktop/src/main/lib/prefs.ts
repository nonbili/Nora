import path from 'path'
import fs from 'fs'
import { app } from 'electron'

export interface Prefs {
  lastDownloadDir?: string
}

const PREF_FILE = () => path.join(app.getPath('userData'), 'prefs.json')

let cache: Prefs | null = null

function read(): Prefs {
  if (cache) return cache
  try {
    cache = JSON.parse(fs.readFileSync(PREF_FILE(), 'utf-8')) as Prefs
  } catch {
    cache = {}
  }
  return cache!
}

export function getPref<K extends keyof Prefs>(key: K): Prefs[K] {
  return read()[key]
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  const prefs = { ...read(), [key]: value }
  cache = prefs
  try {
    fs.writeFileSync(PREF_FILE(), JSON.stringify(prefs))
  } catch {}
}
