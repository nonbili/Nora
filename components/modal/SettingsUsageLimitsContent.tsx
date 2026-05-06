import { useMemo, useState } from 'react'
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { t } from 'i18next'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { NouText } from '../NouText'
import { NouButton } from '../button/NouButton'
import { NouSwitch } from '../switch/NouSwitch'
import { BaseCenterModal } from './BaseCenterModal'
import { settingsUi, SettingsSurface } from './SettingsPrimitives'
import {
  usageLimits$,
  type UsageLimit,
  type UsageLimitScope,
  getLimitUsageToday,
} from '@/states/usage-limits'
import { formatMinutes } from '@/lib/usage-limits'
import { services } from '../service/Services'
import { showToast } from '@/lib/toast'

const subheaderCls = settingsUi.subheaderCls
const surfaceCls = settingsUi.surfaceCls
const rowCls = settingsUi.rowCls
const rowBorderCls = settingsUi.rowBorderCls
const textInputCls = settingsUi.textInputCls

const describeScope = (scope: UsageLimitScope): string => {
  if (scope.kind === 'all') return t('usageLimits.scope.all')
  if (!scope.services.length) return t('usageLimits.scope.none')
  return scope.services
    .map((id) => services[id]?.[0] || id)
    .join(', ')
}

type LimitDraft = {
  id: string | null
  name: string
  applyAll: boolean
  selectedServices: Record<string, boolean>
  hours: string
  minutes: string
}

const emptyDraft = (): LimitDraft => ({
  id: null,
  name: '',
  applyAll: false,
  selectedServices: {},
  hours: '1',
  minutes: '0',
})

const draftFromLimit = (limit: UsageLimit): LimitDraft => {
  const dailyMinutes = limit.dailyMinutes
  const hours = Math.floor(dailyMinutes / 60)
  const minutes = dailyMinutes % 60
  return {
    id: limit.id,
    name: limit.name,
    applyAll: limit.scope.kind === 'all',
    selectedServices:
      limit.scope.kind === 'services'
        ? Object.fromEntries(limit.scope.services.map((s) => [s, true]))
        : {},
    hours: String(hours),
    minutes: String(minutes),
  }
}

const PinSection: React.FC = () => {
  const pin = useValue(usageLimits$.pin)
  const [open, setOpen] = useState<null | 'set' | 'change' | 'remove'>(null)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    setOpen(null)
    setCurrent('')
    setNext('')
    setConfirm('')
    setError(null)
  }

  const submit = () => {
    if (open === 'set') {
      if (!next) {
        setError(t('usageLimits.pin.errorEmpty'))
        return
      }
      if (next !== confirm) {
        setError(t('usageLimits.pin.errorMismatch'))
        return
      }
      usageLimits$.setPin(next)
      close()
      return
    }
    if (current !== pin) {
      setError(t('usageLimits.pin.errorIncorrect'))
      return
    }
    if (open === 'remove') {
      usageLimits$.setPin(null)
      close()
      return
    }
    if (open === 'change') {
      if (!next) {
        setError(t('usageLimits.pin.errorEmpty'))
        return
      }
      if (next !== confirm) {
        setError(t('usageLimits.pin.errorMismatch'))
        return
      }
      usageLimits$.setPin(next)
      close()
    }
  }

  return (
    <>
      <View>
        <NouText className={subheaderCls}>{t('usageLimits.pin.label')}</NouText>
        <SettingsSurface>
        <View className={rowCls}>
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1">
              <NouText className="font-medium">
                {pin ? t('usageLimits.pin.set') : t('usageLimits.pin.notSet')}
              </NouText>
              <NouText className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {t('usageLimits.pin.hint')}
              </NouText>
            </View>
            {pin ? (
              <View className="flex-row gap-2">
                <NouButton size="1" variant="outline" onPress={() => setOpen('change')}>
                  {t('usageLimits.pin.change')}
                </NouButton>
                <NouButton size="1" variant="outline" onPress={() => setOpen('remove')}>
                  {t('usageLimits.pin.remove')}
                </NouButton>
              </View>
            ) : (
              <NouButton size="1" onPress={() => setOpen('set')}>
                {t('usageLimits.pin.setAction')}
              </NouButton>
            )}
          </View>
        </View>
        </SettingsSurface>
      </View>

      {open ? (
        <BaseCenterModal onClose={close} containerClassName="max-h-[80vh] overflow-hidden">
          <ScrollView keyboardShouldPersistTaps="handled">
            <View className="p-5 gap-3">
              <NouText className="text-lg font-semibold">
                {open === 'set'
                  ? t('usageLimits.pin.setAction')
                  : open === 'change'
                  ? t('usageLimits.pin.change')
                  : t('usageLimits.pin.remove')}
              </NouText>
              {open !== 'set' ? (
                <TextInput
                  className={textInputCls}
                  placeholder={t('usageLimits.pin.currentPlaceholder')}
                  placeholderTextColor="#71717a"
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                  value={current}
                  onChangeText={(v) => {
                    setCurrent(v)
                    setError(null)
                  }}
                />
              ) : null}
              {open !== 'remove' ? (
                <>
                  <TextInput
                    className={textInputCls}
                    placeholder={t('usageLimits.pin.newPlaceholder')}
                    placeholderTextColor="#71717a"
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                    value={next}
                    onChangeText={(v) => {
                      setNext(v)
                      setError(null)
                    }}
                  />
                  <TextInput
                    className={textInputCls}
                    placeholder={t('usageLimits.pin.confirmPlaceholder')}
                    placeholderTextColor="#71717a"
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                    value={confirm}
                    onChangeText={(v) => {
                      setConfirm(v)
                      setError(null)
                    }}
                  />
                </>
              ) : null}
              {error ? (
                <NouText className="text-sm text-red-600 dark:text-red-400">{error}</NouText>
              ) : null}
              <View className="mt-2 flex-row justify-end gap-2">
                <NouButton variant="outline" size="1" onPress={close}>
                  {t('buttons.cancel')}
                </NouButton>
                <NouButton size="1" onPress={submit}>
                  {t('buttons.save')}
                </NouButton>
              </View>
            </View>
          </ScrollView>
        </BaseCenterModal>
      ) : null}
    </>
  )
}

const LimitEditor: React.FC<{
  draft: LimitDraft
  onChange: (next: LimitDraft) => void
  onClose: () => void
  onSubmit: () => void
}> = ({ draft, onChange, onClose, onSubmit }) => {
  const serviceEntries = useMemo(() => Object.entries(services), [])
  return (
    <BaseCenterModal onClose={onClose} containerClassName="max-h-[80vh] overflow-hidden">
      <ScrollView keyboardShouldPersistTaps="handled">
        <View className="p-5 gap-4">
          <NouText className="text-lg font-semibold">
            {draft.id ? t('usageLimits.editor.editTitle') : t('usageLimits.editor.addTitle')}
          </NouText>

          <View>
            <NouText className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
              {t('usageLimits.editor.name')}
            </NouText>
            <TextInput
              className={textInputCls}
              value={draft.name}
              onChangeText={(name) => onChange({ ...draft, name })}
              placeholder={t('usageLimits.editor.namePlaceholder')}
              placeholderTextColor="#71717a"
            />
          </View>

          <View>
            <NouText className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
              {t('usageLimits.editor.dailyLimit')}
            </NouText>
            <View className="flex-row gap-2">
              <View className="flex-1">
                <TextInput
                  className={textInputCls}
                  value={draft.hours}
                  keyboardType="number-pad"
                  onChangeText={(hours) => onChange({ ...draft, hours: hours.replace(/[^0-9]/g, '') })}
                  placeholder={t('usageLimits.editor.hours')}
                  placeholderTextColor="#71717a"
                />
                <NouText className="mt-1 text-xs text-zinc-500">{t('usageLimits.editor.hours')}</NouText>
              </View>
              <View className="flex-1">
                <TextInput
                  className={textInputCls}
                  value={draft.minutes}
                  keyboardType="number-pad"
                  onChangeText={(minutes) => onChange({ ...draft, minutes: minutes.replace(/[^0-9]/g, '') })}
                  placeholder={t('usageLimits.editor.minutes')}
                  placeholderTextColor="#71717a"
                />
                <NouText className="mt-1 text-xs text-zinc-500">{t('usageLimits.editor.minutes')}</NouText>
              </View>
            </View>
          </View>

          <View>
            <NouText className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
              {t('usageLimits.editor.scope')}
            </NouText>
            <View className={surfaceCls}>
              <View className={rowCls}>
                <NouSwitch
                  label={<NouText className="font-medium">{t('usageLimits.scope.all')}</NouText>}
                  value={draft.applyAll}
                  onPress={() => onChange({ ...draft, applyAll: !draft.applyAll })}
                />
              </View>
              {!draft.applyAll
                ? serviceEntries.map(([id, [name, icon]], index) => (
                    <View
                      key={id}
                      className={[rowCls, rowBorderCls, index === 0 ? 'border-t border-zinc-300 dark:border-zinc-800' : ''].join(' ')}
                    >
                      <NouSwitch
                        label={
                          <View className="flex-row items-center gap-2">
                            {icon()}
                            <NouText>{name}</NouText>
                          </View>
                        }
                        value={!!draft.selectedServices[id]}
                        onPress={() =>
                          onChange({
                            ...draft,
                            selectedServices: {
                              ...draft.selectedServices,
                              [id]: !draft.selectedServices[id],
                            },
                          })
                        }
                      />
                    </View>
                  ))
                : null}
            </View>
          </View>

          <View className="mt-2 flex-row justify-end gap-2">
            <NouButton variant="outline" size="1" onPress={onClose}>
              {t('buttons.cancel')}
            </NouButton>
            <NouButton size="1" onPress={onSubmit}>
              {draft.id ? t('buttons.save') : t('usageLimits.editor.add')}
            </NouButton>
          </View>
        </View>
      </ScrollView>
    </BaseCenterModal>
  )
}

const PIN_GRACE_MS = 30 * 60 * 1000
let pinUnlockedUntil = 0
const isPinUnlocked = () => Date.now() < pinUnlockedUntil
const refreshPinUnlock = () => {
  pinUnlockedUntil = Date.now() + PIN_GRACE_MS
}

const PinPrompt: React.FC<{ onClose: () => void; onConfirm: () => void; title: string }> = ({
  onClose,
  onConfirm,
  title,
}) => {
  const pin = useValue(usageLimits$.pin)
  const [entered, setEntered] = useState('')
  const [error, setError] = useState(false)
  return (
    <BaseCenterModal onClose={onClose} containerClassName="overflow-hidden">
      <View className="p-5 gap-3">
        <NouText className="text-lg font-semibold">{title}</NouText>
        <TextInput
          className={textInputCls}
          placeholder={t('usageLimits.pin.currentPlaceholder')}
          placeholderTextColor="#71717a"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          value={entered}
          onChangeText={(v) => {
            setEntered(v)
            setError(false)
          }}
        />
        {error ? (
          <NouText className="text-sm text-red-600 dark:text-red-400">
            {t('usageLimits.pin.errorIncorrect')}
          </NouText>
        ) : null}
        <View className="flex-row justify-end gap-2">
          <NouButton variant="outline" size="1" onPress={onClose}>
            {t('buttons.cancel')}
          </NouButton>
          <NouButton
            size="1"
            onPress={() => {
              if (entered === pin) {
                refreshPinUnlock()
                onConfirm()
              } else setError(true)
            }}
          >
            {t('buttons.confirm')}
          </NouButton>
        </View>
      </View>
    </BaseCenterModal>
  )
}

export const SettingsUsageLimitsContent: React.FC = () => {
  const limits = useValue(usageLimits$.limits)
  const pin = useValue(usageLimits$.pin)
  const usageMap = useValue(usageLimits$.usage)
  void usageMap

  const [editorDraft, setEditorDraft] = useState<LimitDraft | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [pendingEditId, setPendingEditId] = useState<string | null>(null)

  const openAdd = () => {
    if (!pin) {
      showToast(t('usageLimits.pin.requiredFirst'))
      return
    }
    setEditorDraft(emptyDraft())
  }

  const openEdit = (limit: UsageLimit) => {
    if (isPinUnlocked()) {
      setEditorDraft(draftFromLimit(limit))
      return
    }
    setPendingEditId(limit.id)
  }

  const requestDelete = (id: string) => {
    if (!pin) {
      showToast(t('usageLimits.pin.requiredFirst'))
      return
    }
    if (isPinUnlocked()) {
      Alert.alert(t('menus.delete'), t('usageLimits.deleteConfirm'), [
        { text: t('buttons.cancel'), style: 'cancel' },
        { text: t('menus.delete'), style: 'destructive', onPress: () => usageLimits$.deleteLimit(id) },
      ])
      return
    }
    setPendingDelete(id)
  }

  const submitDraft = () => {
    if (!editorDraft) return
    const draft = editorDraft
    const name = draft.name.trim() || t('usageLimits.editor.defaultName')
    const hours = parseInt(draft.hours || '0', 10) || 0
    const minutes = parseInt(draft.minutes || '0', 10) || 0
    const total = hours * 60 + minutes
    if (total < 1) {
      showToast(t('usageLimits.editor.errorMinutes'))
      return
    }
    let scope: UsageLimitScope
    if (draft.applyAll) {
      scope = { kind: 'all' }
    } else {
      const selected = Object.entries(draft.selectedServices)
        .filter(([, on]) => on)
        .map(([id]) => id)
      if (!selected.length) {
        showToast(t('usageLimits.editor.errorScope'))
        return
      }
      scope = { kind: 'services', services: selected }
    }
    if (draft.id) {
      usageLimits$.updateLimit(draft.id, { name, scope, dailyMinutes: total })
    } else {
      usageLimits$.addLimit(name, scope, total)
    }
    setEditorDraft(null)
  }

  return (
    <View className="pb-4 gap-8">
      <PinSection />

      <View>
        <View className="mb-3 flex-row items-center justify-between gap-3">
          <NouText className="text-xs uppercase tracking-[0.18em] text-zinc-600 dark:text-gray-500">
            {t('usageLimits.limits')}
          </NouText>
          <Pressable
            onPress={openAdd}
            className="h-8 w-8 items-center justify-center rounded-full border border-zinc-300 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 active:bg-zinc-200 dark:active:bg-zinc-800"
          >
            <MaterialIcons name="add" size={18} color="#6366f1" />
          </Pressable>
        </View>
        <SettingsSurface>
          {!limits.length ? (
            <NouText className="px-4 py-4 text-sm text-zinc-600 dark:text-gray-500">
              {t('usageLimits.empty')}
            </NouText>
          ) : null}
          {limits.map((limit, index) => {
            if (!limit) return null
            const used = getLimitUsageToday(limit.id)
            return (
              <View
                key={limit.id}
                className={['px-4 py-4', index !== limits.length - 1 && rowBorderCls].filter(Boolean).join(' ')}
              >
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-1">
                    <NouText className="font-medium">{limit.name}</NouText>
                    <NouText className="mt-1 text-sm text-zinc-600 dark:text-zinc-400" numberOfLines={2}>
                      {describeScope(limit.scope)}
                    </NouText>
                    <NouText className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      {t('usageLimits.usageLine', {
                        used: formatMinutes(used),
                        limit: formatMinutes(limit.dailyMinutes),
                      })}
                    </NouText>
                  </View>
                </View>
                <View className="mt-3 flex-row flex-wrap justify-end gap-2">
                  <NouButton size="1" variant="outline" onPress={() => openEdit(limit)}>
                    {t('common.edit')}
                  </NouButton>
                  <NouButton size="1" variant="outline" onPress={() => requestDelete(limit.id)}>
                    {t('menus.delete')}
                  </NouButton>
                </View>
              </View>
            )
          })}
        </SettingsSurface>
      </View>

      {editorDraft ? (
        <LimitEditor
          draft={editorDraft}
          onChange={setEditorDraft}
          onClose={() => setEditorDraft(null)}
          onSubmit={submitDraft}
        />
      ) : null}

      {pendingEditId ? (
        <PinPrompt
          title={t('usageLimits.pin.confirmEdit')}
          onClose={() => setPendingEditId(null)}
          onConfirm={() => {
            const limit = usageLimits$.limits.get().find((l) => l?.id === pendingEditId)
            setPendingEditId(null)
            if (limit) setEditorDraft(draftFromLimit(limit))
          }}
        />
      ) : null}

      {pendingDelete ? (
        <PinPrompt
          title={t('usageLimits.pin.confirmDelete')}
          onClose={() => setPendingDelete(null)}
          onConfirm={() => {
            const id = pendingDelete
            setPendingDelete(null)
            Alert.alert(t('menus.delete'), t('usageLimits.deleteConfirm'), [
              { text: t('buttons.cancel'), style: 'cancel' },
              {
                text: t('menus.delete'),
                style: 'destructive',
                onPress: () => usageLimits$.deleteLimit(id),
              },
            ])
          }}
        />
      ) : null}
    </View>
  )
}
