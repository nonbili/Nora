declare module '*.jpg' {
  const content: string
  export default content
}

declare module '*.png' {
  const content: string
  export default content
}

declare module '*.svg' {
  const content: string
  export default content
}

declare module '*?raw' {
  const content: string
  export default content
}

interface Window {
  noraDeeplink: (link: string) => void
}