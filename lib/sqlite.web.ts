import { WATCH_SQLITE_CHANNEL } from '../desktop/src/main/ipc/constants'

/**
 * The part of expo-sqlite's synchronous API the feed uses, on desktop: the database is in the
 * main process, asked synchronously so the queries read as on the phone.
 */

type Params = (string | number | null)[]

const call = (name: string, op: 'exec' | 'all' | 'get' | 'run', source: string, params?: Params) => {
  const answer = window.electron?.ipcRenderer?.sendSync(WATCH_SQLITE_CHANNEL, name, op, source, params)
  if (!answer) throw new Error('no database outside the desktop app')
  if (answer.error) throw new Error(answer.error)
  return answer.result
}

export interface SQLiteDatabase {
  execSync(source: string): void
  getAllSync<T>(source: string, params?: Params): T[]
  getFirstSync<T>(source: string, params?: Params): T | null
  runSync(source: string, params?: Params): { changes: number; lastInsertRowId: number }
  withTransactionSync(task: () => void): void
}

export const openDatabaseSync = (name: string): SQLiteDatabase => ({
  execSync: (source) => call(name, 'exec', source),
  getAllSync: (source, params) => call(name, 'all', source, params),
  getFirstSync: (source, params) => call(name, 'get', source, params),
  runSync: (source, params) => call(name, 'run', source, params),
  withTransactionSync: (task) => {
    call(name, 'exec', 'BEGIN')
    try {
      task()
      call(name, 'exec', 'COMMIT')
    } catch (e) {
      call(name, 'exec', 'ROLLBACK')
      throw e
    }
  },
})
