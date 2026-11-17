import { describe, expect, it } from 'bun:test'
import { downloadFolderLabel, getDownloadDestination } from './download-folder'

describe('getDownloadDestination', () => {
  it('prefers asking, then the picked folder, then Downloads', () => {
    expect(getDownloadDestination({ askDownloadDestination: true, downloadFolder: 'content://x/tree/a' })).toBe('ask')
    expect(getDownloadDestination({ askDownloadDestination: false, downloadFolder: 'content://x/tree/a' })).toBe(
      'folder',
    )
    expect(getDownloadDestination({ askDownloadDestination: false, downloadFolder: '' })).toBe('downloads')
    expect(getDownloadDestination({})).toBe('downloads')
  })
})

describe('downloadFolderLabel', () => {
  it('shows the path inside internal storage', () => {
    expect(downloadFolderLabel('content://com.android.externalstorage.documents/tree/primary%3ADownload%2FNora')).toBe(
      'Download/Nora',
    )
  })

  it('keeps the volume id of other storage', () => {
    expect(downloadFolderLabel('content://com.android.externalstorage.documents/tree/1A2B-3C4D%3APictures')).toBe(
      '1A2B-3C4D:Pictures',
    )
  })

  it('names the storage root by its id', () => {
    expect(downloadFolderLabel('content://com.android.externalstorage.documents/tree/primary%3A')).toBe('primary:')
  })

  it('falls back to the URI when it is not a tree URI or not decodable', () => {
    expect(downloadFolderLabel('content://x/document/1')).toBe('content://x/document/1')
    expect(downloadFolderLabel('content://x/tree/%E0%A4%A')).toBe('content://x/tree/%E0%A4%A')
  })
})
