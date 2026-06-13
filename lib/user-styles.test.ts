import { describe, expect, it } from 'bun:test'
import { getInjectedCss } from '../content/css'
import {
  buildUserScriptExecutionSource,
  getEnabledUserScripts,
  getEnabledUserStyleCss,
  matchesAnyHostGlob,
  matchesHostGlob,
  normalizeUserStyles,
  parseUserscriptMetadata,
  stripUserscriptMetadata,
} from './user-styles'

const withBuiltinEnabled = (id: 'hide-reddit-game' | 'hide-x-bottom-nav' | 'hide-x-home-tabs') =>
  normalizeUserStyles({
    builtins: {
      [id]: { enabled: true },
    } as any,
    customStyles: [],
  })

describe('user style host matching', () => {
  it('matches exact hosts and wildcards', () => {
    expect(matchesHostGlob('x.com', 'x.com')).toBe(true)
    expect(matchesHostGlob('www.reddit.com', '*.reddit.com')).toBe(true)
    expect(matchesHostGlob('chat.reddit.com', '*.reddit.com')).toBe(true)
    expect(matchesHostGlob('reddit.com', '*.reddit.com')).toBe(false)
  })

  it('matches any glob in a style entry', () => {
    expect(matchesAnyHostGlob('m.facebook.com', ['x.com', '*.facebook.com'])).toBe(true)
    expect(matchesAnyHostGlob('x.com', ['*.facebook.com', 'reddit.com'])).toBe(false)
  })
})

describe('normalizeUserStyles', () => {
  it('fills builtin defaults and drops invalid custom styles', () => {
    const snapshot = normalizeUserStyles({
      builtins: {
        'hide-reddit-game': { enabled: false },
      } as any,
      customStyles: [
        {
          id: 'one',
          name: 'Reddit',
          enabled: true,
          hostGlobs: ['*.reddit.com'],
          css: 'body { color: red; }',
        },
        {
          id: 'two',
          name: '',
          enabled: true,
          hostGlobs: ['https://example.com'],
          css: 'body { color: blue; }',
        },
        {
          id: 'three',
          name: 'Empty CSS',
          enabled: true,
          hostGlobs: ['x.com'],
          css: '   ',
        },
      ],
    })

    expect(snapshot.builtins['hide-reddit-game'].enabled).toBe(false)
    expect(snapshot.builtins['hide-x-bottom-nav'].enabled).toBe(true)
    expect(snapshot.builtins['hide-x-home-tabs'].enabled).toBe(false)
    expect(snapshot.customStyles).toHaveLength(1)
    expect(snapshot.customStyles[0]).toMatchObject({
      id: 'one',
      name: 'Reddit',
      hostGlobs: ['*.reddit.com'],
    })
  })

  it('normalizes custom scripts and drops invalid entries', () => {
    const snapshot = normalizeUserStyles({
      customScripts: [
        {
          id: 'one',
          name: 'Reddit script',
          enabled: true,
          hostGlobs: ['*.reddit.com'],
          pinToHeader: true,
          js: 'document.body.dataset.test = "1"',
        },
        {
          id: 'two',
          name: 'Invalid host',
          enabled: true,
          hostGlobs: ['https://example.com'],
          pinToHeader: false,
          js: 'console.log(1)',
        },
        {
          id: 'three',
          name: 'Empty JS',
          enabled: true,
          hostGlobs: ['x.com'],
          pinToHeader: false,
          js: '   ',
        },
      ],
    })

    expect(snapshot.customScripts).toHaveLength(1)
    expect(snapshot.customScripts[0]).toMatchObject({
      id: 'one',
      name: 'Reddit script',
      hostGlobs: ['*.reddit.com'],
      pinToHeader: true,
    })
  })

  it('defaults legacy custom scripts to not pinned', () => {
    const snapshot = normalizeUserStyles({
      customScripts: [
        {
          id: 'legacy',
          name: 'Legacy',
          enabled: true,
          hostGlobs: ['x.com'],
          js: 'console.log("legacy")',
        } as any,
      ],
    })

    expect(snapshot.customScripts[0].pinToHeader).toBe(false)
  })

  it('defaults the enter-as-shift-enter builtin script to off and respects an explicit value', () => {
    const defaults = normalizeUserStyles({})
    expect(defaults.builtinScripts['enter-as-shift-enter'].enabled).toBe(false)

    const enabled = normalizeUserStyles({
      builtinScripts: {
        'enter-as-shift-enter': { enabled: true },
      } as any,
    })
    expect(enabled.builtinScripts['enter-as-shift-enter'].enabled).toBe(true)
  })

  it('includes the builtin script globally only when enabled', () => {
    const off = normalizeUserStyles({})
    expect(getEnabledUserScripts('example.com', off)).toHaveLength(0)

    const on = normalizeUserStyles({
      builtinScripts: {
        'enter-as-shift-enter': { enabled: true },
      } as any,
    })
    const scripts = getEnabledUserScripts('example.com', on)
    expect(scripts).toHaveLength(1)
    expect(scripts[0].id).toBe('enter-as-shift-enter')
    expect(getEnabledUserScripts('chatgpt.com', on)).toHaveLength(1)
  })
})

describe('user style css composition', () => {
  it('includes builtin css only on matching hosts', () => {
    const snapshot = withBuiltinEnabled('hide-reddit-game')

    expect(getEnabledUserStyleCss('www.reddit.com', snapshot)).toContain("ssr-post-content-header")
    expect(getEnabledUserStyleCss('x.com', snapshot)).not.toContain("[role='tablist']")
    expect(getEnabledUserStyleCss('example.com', snapshot)).not.toContain("ssr-post-content-header")
  })

  it('appends matching custom css after builtin css', () => {
    const snapshot = normalizeUserStyles({
      builtins: {
        'hide-reddit-game': { enabled: true },
      } as any,
      customStyles: [
        {
          id: 'custom',
          name: 'Reddit custom',
          enabled: true,
          hostGlobs: ['*.reddit.com'],
          css: '.custom-rule { color: red; }',
        },
      ],
    })

    const css = getInjectedCss('www.reddit.com', {}, snapshot)
    expect(css).toContain("ssr-post-content-header")
    expect(css).toContain('.custom-rule { color: red; }')
    expect(css.indexOf('.custom-rule { color: red; }')).toBeGreaterThan(css.indexOf("ssr-post-content-header"))
  })

  it('keeps always-on site css even when user styles are disabled', () => {
    const snapshot = normalizeUserStyles({
      builtins: {
        'hide-reddit-game': { enabled: false },
        'hide-x-bottom-nav': { enabled: false },
        'hide-x-home-tabs': { enabled: false },
      },
      customStyles: [],
    })

    const css = getInjectedCss('www.instagram.com', {}, snapshot)
    expect(css).toContain('._acc8._abpk')
    expect(css).toContain('article:has(.x1fhwpqd.x132q4wb.x5n08af)')
    expect(css).not.toContain("ssr-post-content-header")
  })

  it('includes x home tab css when the builtin is enabled', () => {
    const snapshot = withBuiltinEnabled('hide-x-home-tabs')

    expect(getEnabledUserStyleCss('x.com', snapshot)).toContain("[role='tablist']")
  })
})

describe('user scripts', () => {
  it('extracts common userscript metadata', () => {
    const source = `// ==UserScript==
// @name Reddit helper
// @match https://*.reddit.com/*
// @include https://x.com/*
// @grant GM_xmlhttpRequest
// ==/UserScript==

console.log('run')`

    expect(parseUserscriptMetadata(source)).toEqual({
      name: 'Reddit helper',
      hostGlobs: ['*.reddit.com', 'x.com'],
    })
    expect(stripUserscriptMetadata(source)).toBe("console.log('run')")
  })

  it('matches enabled scripts by host', () => {
    const snapshot = normalizeUserStyles({
      customScripts: [
        {
          id: 'one',
          name: 'Matching',
          enabled: true,
          hostGlobs: ['*.reddit.com'],
          pinToHeader: true,
          js: 'console.log("match")',
        },
        {
          id: 'two',
          name: 'Disabled',
          enabled: false,
          hostGlobs: ['*.reddit.com'],
          pinToHeader: false,
          js: 'console.log("disabled")',
        },
        {
          id: 'three',
          name: 'Other host',
          enabled: true,
          hostGlobs: ['x.com'],
          pinToHeader: false,
          js: 'console.log("other")',
        },
      ],
    })

    expect(getEnabledUserScripts('www.reddit.com', snapshot).map((script) => script.id)).toEqual(['one'])
    expect(getEnabledUserScripts('x.com', snapshot).map((script) => script.id)).toEqual(['three'])
    expect(getEnabledUserScripts('www.reddit.com', snapshot)[0].pinToHeader).toBe(true)
  })

  it('wraps user script execution with named error handling', () => {
    const source = buildUserScriptExecutionSource({
      name: 'Pinned helper',
      js: 'document.body.dataset.pinned = "1"',
    })

    expect(source).toContain('document.body.dataset.pinned = "1"')
    expect(source).toContain('[Nora user script run] Pinned helper')
    expect(source).toContain('throw error')
  })
})
