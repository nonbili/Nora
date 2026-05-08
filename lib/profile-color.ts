export const autoProfileColors = [
  '#0891b2',
  '#65a30d',
  '#be123c',
  '#7c3aed',
  '#d97706',
  '#0284c7',
  '#059669',
  '#c026d3',
  '#ea580c',
  '#4f46e5',
]

export const getDeterministicProfileColor = (value: string) => {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return autoProfileColors[hash % autoProfileColors.length]
}
