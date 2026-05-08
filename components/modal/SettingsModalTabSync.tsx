import { Alert, View } from 'react-native'
import { NouText } from '../NouText'
import { Image } from 'expo-image'
import { use$ } from '@legendapp/state/react'
import { auth$ } from '@/states/auth'
import { isWeb, isIos } from '@/lib/utils'
import { openDeleteAccount, signOut } from '@/lib/supabase/auth'
import { NouLink } from '../link/NouLink'
import { NouMenu } from '../menu/NouMenu'
import { capitalize } from 'es-toolkit'
import { t } from 'i18next'
import { MaterialButton } from '../button/IconButtons'
import { NouButton } from '../button/NouButton'
import NoraBilling from '@/modules/nora-billing'
import { useEffect, useMemo, useState } from 'react'
import { prepareIosPurchase, syncIosTransaction } from '@/lib/query'
import { queryClient } from '@/lib/query/client'
import { useMe } from '@/lib/hooks/useMe'
import { settingsUi } from './SettingsPrimitives'

const surfaceCls = settingsUi.surfaceCls
const sectionLabelCls = settingsUi.sectionLabelCls
const IOS_SYNC_PRODUCT_ID = 'jp.nonbili.nora.sync'
const TERMS_OF_USE_URL = 'https://www.apple.com/legal/macapps/stdeula/'
const PRIVACY_POLICY_URL = 'https://inks.page/p/privacy'

const SettingsBadge: React.FC<{ label: string }> = ({ label }) => {
  return (
    <View className="rounded-full border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-950 px-3 py-1">
      <NouText className="text-xs text-zinc-700 dark:text-zinc-300">{label}</NouText>
    </View>
  )
}

export const SettingsModalTabSync = () => {
  const { user, userEmail, plan, userId, accessToken } = use$(auth$)
  const { me, refetchMe } = useMe()
  const syncHint = userId && (!plan || plan === 'free') ? t('sync.upgradeHint') : t('sync.hint')
  const [loadingProduct, setLoadingProduct] = useState(isIos)
  const [productPrice, setProductPrice] = useState<string>()
  const [actionError, setActionError] = useState<string>()
  const [busyAction, setBusyAction] = useState<'buy' | 'restore' | 'manage' | null>(null)

  useEffect(() => {
    if (!isIos) {
      return
    }

    let active = true
    const loadProduct = async () => {
      try {
        const products = await NoraBilling.getProducts([IOS_SYNC_PRODUCT_ID])
        if (!active) {
          return
        }
        setProductPrice(products[0]?.displayPrice)
      } catch (error) {
        if (active) {
          setActionError(error instanceof Error ? error.message : String(error))
        }
      } finally {
        if (active) {
          setLoadingProduct(false)
        }
      }
    }

    void loadProduct()
    return () => {
      active = false
    }
  }, [])

  const planLabel = plan ? capitalize(plan) : t('sync.freePlan')
  const restoreConflict = actionError?.startsWith('This App Store subscription is already linked to')
  const iosStatusText = useMemo(() => {
    if (!me?.ios?.expiresAt) {
      return null
    }
    const value = new Date(me.ios.expiresAt).toLocaleString()
    return t('sync.expiresAt', { value, interpolation: { escapeValue: false } })
  }, [me?.ios?.expiresAt])

  const refreshEntitlement = async () => {
    await Promise.all([refetchMe(), queryClient.invalidateQueries({ queryKey: ['me'] })])
  }

  const withBusyAction = async (action: 'buy' | 'restore' | 'manage', run: () => Promise<void>) => {
    setBusyAction(action)
    setActionError(undefined)
    try {
      await run()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusyAction(null)
    }
  }

  const confirmAccountBinding = () =>
    new Promise<boolean>((resolve) => {
      Alert.alert(
        t('sync.purchaseTitle'),
        t('sync.purchaseConfirm', { email: userEmail || user?.email || 'unknown' }),
        [
          {
            text: t('buttons.cancel'),
            style: 'cancel',
            onPress: () => resolve(false),
          },
          {
            text: t('buttons.confirm'),
            onPress: () => resolve(true),
          },
        ],
      )
    })

  const onPurchase = () =>
    withBusyAction('buy', async () => {
      if (!userEmail) {
        throw new Error('Missing Nora account email')
      }
      if (!(await confirmAccountBinding())) {
        return
      }
      const prepared = await prepareIosPurchase()
      const result = await NoraBilling.purchase(IOS_SYNC_PRODUCT_ID, prepared.appAccountToken)
      await syncIosTransaction(result.signedTransactionInfo)
      await refreshEntitlement()
    })

  const onRestore = () =>
    withBusyAction('restore', async () => {
      if (!userEmail) {
        throw new Error('Missing Nora account email')
      }
      if (!(await confirmAccountBinding())) {
        return
      }
      await prepareIosPurchase()
      const entitlements = await NoraBilling.restore()
      const syncEntitlement = entitlements.find((entry) => entry.productId === IOS_SYNC_PRODUCT_ID)
      if (!syncEntitlement) {
        throw new Error('No Nora Sync purchase found to restore')
      }
      await syncIosTransaction(syncEntitlement.signedTransactionInfo)
      await refreshEntitlement()
    })

  const onManageSubscriptions = () =>
    withBusyAction('manage', async () => {
      await NoraBilling.manageSubscriptions()
    })

  const onDeleteAccount = async () => {
    setActionError(undefined)
    if (!accessToken) {
      setActionError(t('sync.signInRequired'))
      return
    }
    try {
      await openDeleteAccount(accessToken)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    }
  }

  const accountMenuItems = [
    ...(isIos
      ? me?.source === 'app_store' && me?.plan === 'sync'
        ? [{ label: t('sync.manageIos'), handler: () => void onManageSubscriptions() }]
        : []
      : []),
    ...(isIos ? [{ label: t('sync.restore'), handler: () => void onRestore() }] : []),
    ...(isIos ? [{ label: t('sync.deleteAccount'), handler: () => void onDeleteAccount() }] : []),
    { label: t('menus.signOut'), handler: signOut },
  ]

  if (!userId) {
    return (
      <View className="gap-6">
        <View>
          <NouText className={sectionLabelCls}>{t('sync.label')}</NouText>
          <View className={surfaceCls}>
            <View className="px-5 py-5">
              <NouText className="text-lg font-semibold">{t('sync.label')}</NouText>
              <NouText className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{syncHint}</NouText>
              <View className="mt-5">
                <NouLink
                  className="rounded-full bg-zinc-900 px-5 py-2.5 text-center text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-950"
                  href="https://nora.inks.page/auth/app"
                  target="_blank"
                >
                  Login Nora
                </NouLink>
              </View>
            </View>
          </View>
        </View>
      </View>
    )
  }

  return (
    <View className="gap-6">
      <View>
        <NouText className={sectionLabelCls}>{t('sync.label')}</NouText>
        <View className={surfaceCls}>
          <View className="flex-row items-center gap-3 px-4 py-4">
            <Image
              style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: '#18181b' }}
              source={user?.picture}
              contentFit="cover"
            />
            <View className="flex-1">
              <NouText className="font-medium">{userEmail || user?.email || 'Nora User'}</NouText>
              <NouText className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {t('sync.currentPlan')}: {planLabel}
              </NouText>
            </View>
            <NouMenu
              trigger={isWeb ? <MaterialButton name="more-vert" /> : isIos ? 'ellipsis' : 'filled.MoreVert'}
              items={accountMenuItems}
            />
          </View>
        </View>
      </View>

      <View>
        <NouText className={sectionLabelCls}>{t('sync.currentPlan')}</NouText>
        <View className={surfaceCls}>
          <View className="px-5 py-5">
            <View className="flex-row flex-wrap gap-2">
              <SettingsBadge label={planLabel} />
              {me?.source === 'app_store' ? <SettingsBadge label={t('sync.activeViaIos')} /> : null}
            </View>
            <NouText className="mt-4 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{syncHint}</NouText>
            {iosStatusText ? <NouText className="mt-3 text-xs text-zinc-600 dark:text-zinc-500">{iosStatusText}</NouText> : null}
            {actionError ? <NouText className="mt-3 text-sm text-red-400">{actionError}</NouText> : null}
            {restoreConflict ? (
              <View className="mt-3">
                <NouButton variant="outline" onPress={signOut}>
                  {t('sync.signOutSwitch')}
                </NouButton>
              </View>
            ) : null}
            {isIos ? (
              <View className="mt-5 gap-3">
                {loadingProduct ? <NouText className="text-sm text-zinc-600 dark:text-zinc-400">{t('sync.priceLoading')}</NouText> : null}
                {!loadingProduct && !productPrice ? <NouText className="text-sm text-zinc-600 dark:text-zinc-400">{t('sync.productUnavailable')}</NouText> : null}
                {me?.source === 'app_store' && me?.plan === 'sync' ? (
                  busyAction === 'manage' || busyAction === 'restore' ? (
                    <NouText className="text-sm text-zinc-400">
                      {busyAction === 'manage' ? t('sync.manageIos') : t('sync.restore')}
                    </NouText>
                  ) : null
                ) : (
                  <>
                    <NouButton
                      loading={busyAction === 'buy'}
                      disabled={loadingProduct || !productPrice}
                      onPress={() => void onPurchase()}
                    >
                      {productPrice ? `${t('sync.buy')} ${productPrice}` : t('sync.buy')}
                    </NouButton>
                    {busyAction === 'restore' ? <NouText className="text-sm text-zinc-600 dark:text-zinc-400">{t('sync.restore')}</NouText> : null}
                  </>
                )}
                <View className="gap-2 rounded-2xl border border-zinc-300 dark:border-zinc-800 bg-zinc-100/80 dark:bg-zinc-950/70 px-4 py-3">
                  <NouText className="text-xs leading-5 text-zinc-600 dark:text-zinc-400">{t('sync.legalNotice')}</NouText>
                  <View className="flex-row flex-wrap gap-3">
                    <NouLink className="text-xs text-zinc-900 dark:text-zinc-100 underline" href={TERMS_OF_USE_URL}>
                      {t('sync.termsOfUse')}
                    </NouLink>
                    <NouLink className="text-xs text-zinc-900 dark:text-zinc-100 underline" href={PRIVACY_POLICY_URL}>
                      {t('sync.privacyPolicy')}
                    </NouLink>
                  </View>
                </View>
              </View>
            ) : (
              <View className="mt-5">
                {me?.source === 'app_store' ? (
                  <NouText className="text-sm text-zinc-600 dark:text-zinc-400">{t('sync.activeViaIos')}</NouText>
                ) : (
                  <NouLink
                    className="rounded-full border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-950 px-5 py-2.5 text-center text-sm text-zinc-900 dark:text-zinc-100"
                    href="https://nora.inks.page/app"
                  >
                    {t('sync.managePlan')}
                  </NouLink>
                )}
              </View>
            )}
          </View>
        </View>
      </View>
    </View>
  )
}
