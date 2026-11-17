// Incoming links are opened as tabs by app/index.tsx. Keep the router on `/`, otherwise it
// routes them to +not-found and back, remounting every tab and reloading its stored url.
export function redirectSystemPath(_event: { path: string; initial: boolean }) {
  return '/'
}
