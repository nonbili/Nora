import { noraSettingsEvent } from './nora'
import {
  getSearchPageOffset,
  getSearchPageUsername,
  isChallengePage,
  isResultsPage,
  parseSearchResults,
  pickNextForm,
  type SearchResult,
} from '../lib/public-posts'

const STORAGE_KEY = '__nora_posts_search'
const MAX_PAGES = 3
// A search that has been left half way is not carried on by whatever page of results comes next.
// Long enough for a person to pass a check in between.
const STATE_LIFETIME_MS = 5 * 60_000

interface SearchState {
  startedAt: number
  username: string
  page: number
  /** Where the page on screen starts, which is how its Next form is told from its Previous one. */
  offset: number
  results: SearchResult[]
}

const readState = (): SearchState | null => {
  try {
    const state: SearchState | null = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null')
    return state && Date.now() - state.startedAt < STATE_LIFETIME_MS ? state : null
  } catch {
    return null
  }
}

const readNextFields = (form: HTMLFormElement) => {
  const data = new FormData(form)
  return {
    offset: Number(data.get('s')),
    dc: Number(data.get('dc')),
    vqd: String(data.get('vqd') ?? ''),
    kl: String(data.get('kl') ?? ''),
    nextParams: String(data.get('nextParams') ?? ''),
  }
}

const writeState = (state: SearchState | null) => {
  try {
    if (state) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } else {
      sessionStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // No storage on this page: the search then ends at the first page of results.
  }
}

/**
 * The page DuckDuckGo shows for the search of a profile's posts, opened by the app in a tab so a
 * person can pass its check themselves. Once it shows results, they are read -- a few pages of
 * them, by following its own Next button -- and handed to the app, which closes the tab and adds
 * the posts to the profile the search was opened from. A check is left to the person: nothing
 * happens until the page has results.
 */
export function initSearchResultsReporter(emit: (type: string, data: unknown) => void) {
  if (document.location.hostname !== 'html.duckduckgo.com') {
    return
  }

  let handled = false
  let challengeReported = false
  const run = () => {
    // The app's word that the mode is on reaches a page that has only just opened after the page
    // has loaded, so this is tried again when it arrives, and acts once.
    if (handled || !window.Nora?.getSettings?.().anonymousMode || document.readyState === 'loading') {
      return
    }
    const html = document.documentElement.outerHTML
    // The address of a search for a profile starts one, at the page it names; the pages after it have none to read.
    const { href } = document.location
    const started = getSearchPageUsername(href)
    if (isChallengePage(html)) {
      if (!challengeReported) {
        challengeReported = true
        // Kept across the check: the page it leads to may not carry the address the search was opened with.
        if (started) {
          writeState({ startedAt: Date.now(), username: started, page: 0, offset: getSearchPageOffset(href), results: [] })
        }
        // Told to the app, which brings this tab forward if it is a search of its own.
        emit('search-challenge', {})
      }
      return
    }
    if (!isResultsPage(html)) {
      return
    }
    handled = true

    const state: SearchState | null = started
      ? { startedAt: Date.now(), username: started, page: 0, offset: getSearchPageOffset(href), results: [] }
      : readState()
    if (!state) {
      return
    }

    state.results.push(...parseSearchResults(html))
    state.page += 1
    // A page after the first has a Previous form before its Next one, and following the first would go back.
    const forms = [...document.querySelectorAll<HTMLFormElement>('.nav-link form')]
    const offsets = forms.map((form) => Number(new FormData(form).get('s')))
    const index = pickNextForm(offsets, state.offset)
    const next = index === -1 ? null : forms[index]
    if (state.page < MAX_PAGES && next) {
      state.offset = offsets[index]
      writeState(state)
      next.submit()
      return
    }

    writeState(null)
    // Where this stopped goes with the results, so that the app can ask for the pages after it.
    emit('search-results', { username: state.username, results: state.results, next: next ? readNextFields(next) : null })
  }

  window.addEventListener(noraSettingsEvent, run)
  document.addEventListener('DOMContentLoaded', run, { once: true })
  run()
}
