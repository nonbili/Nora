// Shared with the UI-thread drag worklet. Moving a tab shifts every intervening
// tab by one slot, preserving their relative order in both directions.
export function moveTabPosition(positions: Record<string, number>, id: string, targetIndex: number) {
  'worklet'
  const from = positions[id]
  if (from === undefined || from === targetIndex) return positions
  const next = { ...positions }
  for (const key in next) {
    if (key === id) continue
    const index = next[key]
    if (from < targetIndex && index > from && index <= targetIndex) next[key] = index - 1
    if (from > targetIndex && index >= targetIndex && index < from) next[key] = index + 1
  }
  next[id] = targetIndex
  return next
}
