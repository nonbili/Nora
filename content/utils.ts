export function emit(type: string, data?: any) {
  if (window.NoraI) {
    window.NoraI.onMessage(JSON.stringify({ type, data }))
  } else if (window.electron) {
    window.electron.ipcRenderer.sendToHost(type, data)
    window.electron.ipcRenderer.send('channel:content', { type, data })
  }
}

export function log(...data: any[]) {
  console.log(...data)
  emit('[content]', data.length > 1 ? { data: [...data] } : data[0])
}

export function parseJson(v: string | null, fallback: any = {}) {
  if (!v) {
    return fallback
  }
  try {
    return JSON.parse(v)
  } catch (e) {
    console.warn(e, v)
    return fallback
  }
}

export async function waitUntil(predicate: () => any, retries = 10, delay = 200, count = 0) {
  const res = await predicate()
  if (res) {
    return res
  }
  await new Promise((resolve) => setTimeout(resolve, delay))
  if (count < retries) {
    return waitUntil(predicate, retries, delay, count + 1)
  }
}
