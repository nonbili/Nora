import { expect, it } from 'bun:test'
import { interceptClipboard } from './clipboard'

it('cleans clipboard API, legacy Copy link selection and native share URLs', async () => {
  let copied = '',
    shared: any,
    listener: any,
    selection = ''
  const nav = {
    clipboard: {
      async writeText(text: string) {
        copied = text
      },
    },
    async share(data: any) {
      shared = data
    },
  }
  interceptClipboard(
    nav as any,
    {
      addEventListener: (_: string, fn: any) => {
        listener = fn
      },
      getSelection: () => ({ toString: () => selection }),
    } as any,
  )
  const url = 'https://x.com/u/status/123?a=token&s=20'
  await nav.clipboard.writeText(url)
  expect(copied).toBe('https://x.com/u/status/123')
  selection = url
  let prevented = false
  listener({
    clipboardData: {
      setData: (_: string, text: string) => {
        copied = text
      },
    },
    preventDefault: () => {
      prevented = true
    },
  })
  expect(copied).toBe('https://x.com/u/status/123')
  expect(prevented).toBe(true)
  await nav.share({ title: 'Post', url })
  expect(shared).toEqual({ title: 'Post', url: 'https://x.com/u/status/123' })
  selection = 'Ordinary copied text'
  prevented = false
  listener({
    clipboardData: {
      setData() {
        throw Error('must not replace text')
      },
    },
    preventDefault: () => {
      prevented = true
    },
  })
  expect(prevented).toBe(false)
  for (const url of ['https://example.com', 'https://ja.wikipedia.org/wiki/東京']) {
    selection = url
    listener({
      clipboardData: {
        setData() {
          throw Error('must not normalize text')
        },
      },
      preventDefault() {
        throw Error('must not replace copy')
      },
    })
    await nav.clipboard.writeText(url)
    expect(copied).toBe(url)
    await nav.share({ url })
    expect(shared.url).toBe(url)
  }
  selection = url
  listener({
    defaultPrevented: true,
    clipboardData: {
      setData() {
        throw Error('must not override page copy')
      },
    },
  })
})

it('works when clipboard and share APIs are unavailable', () => {
  expect(() => interceptClipboard({} as any, { addEventListener() {} } as any)).not.toThrow()
})
