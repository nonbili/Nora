import { clsx } from '@/lib/utils'
import { PropsWithChildren } from 'react'
import { View } from 'react-native'
import { NouText } from '../NouText'

export const settingsUi = {
  surfaceCls: 'overflow-hidden rounded-[24px] bg-white dark:bg-zinc-900',
  sectionLabelCls: 'mb-2 px-1 text-[11px] uppercase tracking-[0.18em] text-zinc-600 dark:text-zinc-500',
  subheaderCls: 'mb-3 text-xs uppercase tracking-[0.18em] text-zinc-600 dark:text-gray-500',
  rowCls: 'px-4 py-4',
  rowBorderCls: 'border-b-2 border-zinc-100 dark:border-zinc-950',
  iconWrapCls:
    'h-10 w-10 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-950',
  textInputCls: 'rounded-2xl border border-zinc-300 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-950 px-4 py-4 text-zinc-900 dark:text-white',
}

export const SettingsSection = ({ label, children }: PropsWithChildren<{ label?: string }>) => (
  <View>
    {label ? <NouText className={settingsUi.sectionLabelCls}>{label}</NouText> : null}
    {children}
  </View>
)

export const SettingsSurface = ({ className, children }: PropsWithChildren<{ className?: string }>) => (
  <View className={clsx(settingsUi.surfaceCls, className)}>{children}</View>
)

export const SettingsRow = ({ isLast = false, className, children }: PropsWithChildren<{ isLast?: boolean; className?: string }>) => (
  <View className={clsx(settingsUi.rowCls, !isLast && settingsUi.rowBorderCls, className)}>{children}</View>
)
