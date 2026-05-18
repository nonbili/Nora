import { observable } from '@legendapp/state'

export const desktopWorkspaceState$ = observable({
  focusedEmptySlotByGroup: {} as Record<string, number>,
})

export const focusDesktopGroupSlot = (groupId: string, slotIndex: number) => {
  const current = desktopWorkspaceState$.focusedEmptySlotByGroup[groupId].get()
  if (current !== slotIndex) {
    desktopWorkspaceState$.focusedEmptySlotByGroup[groupId].set(slotIndex)
  }
}
