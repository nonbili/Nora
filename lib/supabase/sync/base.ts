import { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../client'
import { auth$ } from '@/states/auth'
import { debounce } from 'es-toolkit'

export abstract class BaseSyncer<T> {
  abstract NAME: string
  abstract TABLE_NAME: string
  abstract COLUMNS: string
  abstract SYNC_STATE_FIELD: string

  abstract isPersistLoaded(): Promise<boolean>

  abstract getStore(): { value: T; updatedAt: number; syncedAt: number | undefined }

  abstract setStore(data: { value: T; updatedAt: number }): void

  abstract setSyncedTime(): void

  async fetchValue(): Promise<{ value: T; updatedAt: number } | null> {
    const { data, error } = (await supabase.from(this.TABLE_NAME).select(this.COLUMNS).single()) as unknown as {
      data: { json: T; updated_at: string }
      error: PostgrestError | null
    }
    if (error) {
      if (error.code !== 'PGRST116') {
        console.error(error)
      }
      return null
    }
    return {
      value: data.json as T,
      updatedAt: new Date(data.updated_at).getTime(),
    }
  }

  async saveValue(value: T, updatedAt: number) {
    const user_id = auth$.userId.get()
    if (!user_id) {
      return
    }

    const { error } = await supabase.from(this.TABLE_NAME).upsert({
      json: value,
      user_id,
      updated_at: new Date(updatedAt).toISOString(),
    })
    if (error) {
      throw error
    }
    console.log(`saved ${this.NAME}`)
  }

  private _sync = async (fullSync?: boolean) => {
    await this.isPersistLoaded()

    const { userId: user_id } = auth$.get()
    if (!user_id) {
      return
    }

    const { data, error } = await supabase.from('sync_states').select('json')
    if (error) {
      throw error
    }

    const remoteSyncState = data[0]?.json
    const remoteUpdatedAt = new Date(remoteSyncState?.[this.SYNC_STATE_FIELD] || 0).getTime()
    const { value, updatedAt, syncedAt } = this.getStore()
    console.log(`sync ${this.NAME}`, { remoteUpdatedAt, updatedAt, syncedAt })

    const updateRemoteSyncState = async (value: number) => {
      await supabase
        .from('sync_states')
        .upsert({ json: { ...remoteSyncState, [this.SYNC_STATE_FIELD]: new Date(value).toISOString() }, user_id })
    }

    if (!remoteSyncState?.[this.SYNC_STATE_FIELD]) {
      if (updatedAt > 0) {
        // full sync: local -> remote
        console.log(`full sync ${this.NAME}: local -> remote`)
        await this.saveValue(value, updatedAt)
        await updateRemoteSyncState(updatedAt)
      } else {
        const remote = await this.fetchValue()
        if (remote) {
          console.log(`full sync ${this.NAME}: remote -> local (sync_states was empty)`)
          this.setStore(remote)
          await updateRemoteSyncState(remote.updatedAt)
        }
      }
      this.setSyncedTime()
      return
    }

    if (!syncedAt && updatedAt > 0) {
      const remote = await this.fetchValue()
      if (remote) {
        if (updatedAt > remote.updatedAt) {
          await this.saveValue(value, updatedAt)
          await updateRemoteSyncState(updatedAt)
        } else if (remote.updatedAt > updatedAt) {
          this.setStore(remote)
          await updateRemoteSyncState(remote.updatedAt)
        }
      } else {
        await this.saveValue(value, updatedAt)
        await updateRemoteSyncState(updatedAt)
      }
    } else if (fullSync || remoteUpdatedAt > updatedAt) {
      // full sync: remote -> local
      console.log(`full sync ${this.NAME}: remote -> local`)
      const remote = await this.fetchValue()
      if (remote) {
        this.setStore(remote)
      }
    } else if (remoteUpdatedAt < updatedAt) {
      // partial sync: local -> remote
      console.log(`partial sync ${this.NAME}: local -> remote`)
      await this.saveValue(value, updatedAt)
      await updateRemoteSyncState(updatedAt)
    }

    this.setSyncedTime()
  }

  private debouncedSync = debounce(
    this._sync,
    60 * 1000, // 1 minute
    { edges: ['leading', 'trailing'] },
  )

  async sync(fullSync?: boolean) {
    const { userId, plan } = auth$.get()
    if (userId && plan && plan != 'free') {
      this.debouncedSync(fullSync)
    }
  }
}
