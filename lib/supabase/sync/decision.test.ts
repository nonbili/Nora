import { describe, expect, it } from 'bun:test'
import { decideDocumentSync } from './decision'

describe('decideDocumentSync', () => {
  it('pushes when remote row is missing and the resource should always exist remotely', () => {
    expect(
      decideDocumentSync({
        dirty: false,
        hasRemote: false,
        remoteUpdatedAt: undefined,
        lastSyncedRemoteUpdatedAt: undefined,
        pushWhenRemoteMissing: true,
        hasMeaningfulLocalValue: true,
      }),
    ).toEqual({ action: 'push', backupLocal: false })
  })

  it('does nothing when bookmarks are empty and remote row is missing', () => {
    expect(
      decideDocumentSync({
        dirty: false,
        hasRemote: false,
        remoteUpdatedAt: undefined,
        lastSyncedRemoteUpdatedAt: undefined,
        pushWhenRemoteMissing: false,
        hasMeaningfulLocalValue: false,
      }),
    ).toEqual({ action: 'noop', backupLocal: false })
  })

  it('pulls remote state when local is clean and the remote row changed', () => {
    expect(
      decideDocumentSync({
        dirty: false,
        hasRemote: true,
        remoteUpdatedAt: '2026-03-15T00:00:00Z',
        lastSyncedRemoteUpdatedAt: '2026-03-14T00:00:00Z',
        pushWhenRemoteMissing: false,
        hasMeaningfulLocalValue: true,
      }),
    ).toEqual({ action: 'pull', backupLocal: false })
  })

  it('pushes local state when remote is unchanged since the last successful sync', () => {
    expect(
      decideDocumentSync({
        dirty: true,
        hasRemote: true,
        remoteUpdatedAt: '2026-03-15T00:00:00Z',
        lastSyncedRemoteUpdatedAt: '2026-03-15T00:00:00Z',
        pushWhenRemoteMissing: false,
        hasMeaningfulLocalValue: true,
      }),
    ).toEqual({ action: 'push', backupLocal: false })
  })

  it('backs up local state and pulls remote when both sides diverged', () => {
    expect(
      decideDocumentSync({
        dirty: true,
        hasRemote: true,
        remoteUpdatedAt: '2026-03-16T00:00:00Z',
        lastSyncedRemoteUpdatedAt: '2026-03-15T00:00:00Z',
        pushWhenRemoteMissing: false,
        hasMeaningfulLocalValue: true,
      }),
    ).toEqual({ action: 'pull', backupLocal: true })
  })

  it('backs up local state and pulls remote on first authenticated sync when remote exists', () => {
    expect(
      decideDocumentSync({
        dirty: true,
        hasRemote: true,
        remoteUpdatedAt: '2026-03-16T00:00:00Z',
        lastSyncedRemoteUpdatedAt: undefined,
        pushWhenRemoteMissing: false,
        hasMeaningfulLocalValue: true,
      }),
    ).toEqual({ action: 'pull', backupLocal: true })
  })
})
