/// <reference types="vite/client" />

declare global {
  interface Window {
    noraDeeplink: (link: string) => void
  }
}

export {}
