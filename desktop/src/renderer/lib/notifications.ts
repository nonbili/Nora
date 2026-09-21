import { tabs$ } from '../../../../states/tabs'
import { tabGroups$ } from '../../../../states/tab-groups'

export function activateNotificationTabById(tabId: string) {
  if (!tabs$.tabs.get().some((tab) => tab.id === tabId)) return
  const group = tabGroups$.groups.get().find((currentGroup) => currentGroup.tabIds.includes(tabId))
  tabGroups$.setActiveGroup(group?.id ?? null)
  tabs$.setActiveTabById(tabId, 'user')
}
