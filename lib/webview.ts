type ScriptableWebview = {
  executeJavaScript?: (script: string) => unknown
}

type PausableWebview = ScriptableWebview & {
  stop?: () => unknown
  stopLoading?: () => unknown
}

const tabWebviews = new Map<string, PausableWebview>()

export function executeWebviewJavaScript(webview: ScriptableWebview | null | undefined, script: string) {
  if (!webview?.executeJavaScript) {
    return Promise.resolve(undefined)
  }

  try {
    return Promise.resolve(webview.executeJavaScript(script))
  } catch (error) {
    return Promise.reject(error)
  }
}

export function executeWebviewJavaScriptQuietly(webview: ScriptableWebview | null | undefined, script: string) {
  return executeWebviewJavaScript(webview, script).catch(() => undefined)
}

export function registerTabWebview(tabId: string, webview: PausableWebview | null | undefined) {
  if (webview) {
    tabWebviews.set(tabId, webview)
  } else {
    tabWebviews.delete(tabId)
  }
}

export function getTabWebview(tabId: string) {
  return tabWebviews.get(tabId)
}

export function pauseWebview(webview: PausableWebview | null | undefined) {
  if (!webview) {
    return
  }

  if (typeof webview.stop === 'function') {
    webview.stop()
  } else if (typeof webview.stopLoading === 'function') {
    webview.stopLoading()
  }

  void executeWebviewJavaScriptQuietly(
    webview,
    `
      (() => {
        document.querySelectorAll('audio, video').forEach((media) => {
          media.pause();
          media.removeAttribute('autoplay');
        });
      })()
    `,
  )
}
