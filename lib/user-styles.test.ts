import { describe, expect, it } from 'bun:test'
import { load } from 'cheerio'
import { getInjectedCss } from '../content/css'
import {
  buildUserScriptExecutionSource,
  builtinUserStyleDefinitionById,
  type BuiltinUserStyleId,
  getEnabledUserScripts,
  getEnabledUserStyleCss,
  matchesAnyHostGlob,
  matchesHostGlob,
  normalizeUserStyles,
  parseUserscriptMetadata,
  stripUserscriptMetadata,
} from './user-styles'

const withBuiltinEnabled = (id: BuiltinUserStyleId) =>
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
    expect(snapshot.builtins['hide-facebook-feed'].enabled).toBe(false)
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
        'hide-facebook-feed': { enabled: false },
        'hide-reddit-game': { enabled: false },
        'hide-x-bottom-nav': { enabled: false },
        'hide-x-home-tabs': { enabled: false },
        'hide-x-grok': { enabled: false },
        'hide-x-recommendations': { enabled: false },
        'hide-x-engagement-counts': { enabled: false },
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

  it('includes Facebook feed CSS on mobile and desktop Facebook hosts only when enabled', () => {
    const off = normalizeUserStyles({})
    const on = withBuiltinEnabled('hide-facebook-feed')

    expect(getEnabledUserStyleCss('m.facebook.com', off)).not.toContain("[role='feed']")
    expect(getEnabledUserStyleCss('m.facebook.com', on)).toContain("[role='feed']")
    expect(getEnabledUserStyleCss('m.facebook.com', on)).toContain('[data-tracking-duration-id]')
    expect(getEnabledUserStyleCss('m.facebook.com', on)).toContain("[data-type='vscroller']")
    expect(getEnabledUserStyleCss('www.facebook.com', on)).toContain("[role='feed']")
    expect(getEnabledUserStyleCss('messenger.com', on)).not.toContain("[role='feed']")
  })
})

describe('optional X controls', () => {
  const ids = ['hide-x-grok', 'hide-x-recommendations', 'hide-x-engagement-counts'] as const
  const selectorFor = (id: (typeof ids)[number]) =>
    builtinUserStyleDefinitionById[id].css.replace(/\/\*[\s\S]*?\*\//g, '').split('{')[0].trim()

  it('keeps new and legacy snapshots opted out, and preserves explicit choices', () => {
    for (const id of ids) {
      expect(normalizeUserStyles({}).builtins[id].enabled).toBe(false)
      expect(withBuiltinEnabled(id).builtins[id].enabled).toBe(true)
      expect(getEnabledUserStyleCss('x.com')).not.toContain(builtinUserStyleDefinitionById[id].css.trim())
      // Old callers may inject a snapshot before normalization during startup.
      const legacy = normalizeUserStyles({})
      delete (legacy.builtins as any)[id]
      expect(getEnabledUserStyleCss('x.com', legacy)).not.toContain(builtinUserStyleDefinitionById[id].css.trim())
    }
  })

  it('supports X and legacy Twitter hosts without affecting other sites', () => {
    for (const id of ids) {
      const css = builtinUserStyleDefinitionById[id].css.trim()
      for (const host of ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com']) {
        expect(getEnabledUserStyleCss(host, withBuiltinEnabled(id))).toContain(css)
      }
      expect(getEnabledUserStyleCss('example.com', withBuiltinEnabled(id))).not.toContain(css)
    }
  })

  it('selects Grok controls without selecting tweet text or links to Grok in posts', () => {
    const $ = load(`<header><a id="grok-nav" href="/i/grok">Grok</a></header>
      <article data-testid="tweet"><div data-testid="tweetText" id="text">Grok
        <a id="post-link" href="/i/grok">link</a></div>
        <button id="grok-action" aria-label="Grok actions"><svg></svg></button>
        <button id="reply" data-testid="reply">Reply</button></article>`)
    expect($(selectorFor('hide-x-grok')).map((_, node) => $(node).attr('id')).get()).toEqual([
      'grok-nav', 'grok-action',
    ])
  })

  it('selects mobile recommendation modules and marked Discover more cells, not followed posts or their timeline', () => {
    const $ = load(`<main><div aria-label="Timeline: Your Home Timeline" id="timeline">
      <div id="followed"><article data-testid="tweet"><div data-testid="tweetText">Who to follow</div>
        <button data-testid="123-follow">Follow</button></article></div>
      <aside id="who" aria-label="Who to follow"><button data-testid="456-follow">Follow</button></aside>
      <div data-testid="sidebarColumn"><div id="trend" data-testid="trend">Trending</div></div>
      <div id="discover-heading" data-nora-x-recommendation>Discover more</div>
      <div id="discover-post" data-nora-x-recommendation><article data-testid="tweet">Suggested post</article></div>
      </div></main>`)
    expect($(selectorFor('hide-x-recommendations')).map((_, node) => $(node).attr('id')).get()).toEqual([
      'who', 'trend', 'discover-heading', 'discover-post',
    ])
  })

  it('preserves intentional Explore trends while hiding sidebar trends', () => {
    const $ = load(`<main data-testid="primaryColumn">
      <section aria-label="Timeline: Trending now" id="explore"><div data-testid="trend" id="explore-trend">Trend</div></section>
      <div data-testid="trends" id="explore-trends">Trends</div></main>
      <aside data-testid="sidebarColumn"><section aria-label="Timeline: Trending now" id="sidebar-timeline">
      <div data-testid="trend" id="sidebar-trend">Trend</div></section>
      <div data-testid="trends" id="sidebar-trends">Trends</div></aside>`)
    expect($(selectorFor('hide-x-recommendations')).map((_, node) => $(node).attr('id')).get()).toEqual([
      'sidebar-timeline', 'sidebar-trend', 'sidebar-trends',
    ])
  })

  it('hides count text while preserving action buttons, SVG icons, and ordinary tweet links', () => {
    const $ = load(`<article data-testid="tweet"><div data-testid="tweetText" id="text">
      <a href="/someone/status/123/likes"><span id="post-link">a link in a post</span></a></div>
      <div role="group"><button data-testid="like" id="like" aria-label="2 Likes. Like">
      <svg id="icon"></svg><span id="count" data-testid="app-text-transition-container">2</span></button>
      <button data-testid="reply" id="reply"><svg></svg><span id="replies" data-testid="app-text-transition-container">3</span></button>
      <a href="/someone/status/123/analytics" id="views"><svg></svg><span id="view-count">40</span></a></div>
      <a href="/someone/status/123/retweets" id="reposts"><span id="repost-count">4 Reposts</span></a></article>`)
    const selected = $(selectorFor('hide-x-engagement-counts'))
    expect(selected.map((_, node) => $(node).attr('id')).get()).toEqual([
      'count', 'replies', 'view-count', 'repost-count',
    ])
    expect(selected.is('button, [role="button"], svg, a')).toBe(false)
    expect(builtinUserStyleDefinitionById['hide-x-engagement-counts'].css).toContain('visibility: hidden')
    expect(builtinUserStyleDefinitionById['hide-x-engagement-counts'].css).not.toContain('display: none')
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
