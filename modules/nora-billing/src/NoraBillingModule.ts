import { NativeModule, requireNativeModule } from 'expo'
import { isIos } from '@/lib/utils'

export interface NoraBillingProduct {
  id: string
  title: string
  description: string
  displayPrice: string
}

export interface NoraBillingEntitlement {
  transactionId: string
  originalTransactionId: string
  productId: string
  purchaseDate: string
  expirationDate: string | null
  revocationDate: string | null
  appAccountToken: string | null
  environment: string | null
  signedTransactionInfo: string
}

type NoraBillingEvents = {
  onTransactionUpdated: (transaction: NoraBillingEntitlement) => void
}

declare class NoraBillingModule extends NativeModule<NoraBillingEvents> {
  getProducts(productIds: string[]): Promise<NoraBillingProduct[]>
  /* Resolves with an unfinished transaction; call finishTransaction once the backend has it. */
  purchase(productId: string, appAccountToken: string): Promise<NoraBillingEntitlement>
  restore(): Promise<NoraBillingEntitlement[]>
  getUnfinishedTransactions(): Promise<NoraBillingEntitlement[]>
  finishTransaction(transactionId: string): Promise<void>
  manageSubscriptions(): Promise<void>
}

const unsupportedError = () => Promise.reject(new Error('In-app purchases are only available on iOS'))

const NoraBilling = isIos
  ? requireNativeModule<NoraBillingModule>('NoraBilling')
  : ({
      getProducts: unsupportedError,
      purchase: unsupportedError,
      restore: unsupportedError,
      getUnfinishedTransactions: unsupportedError,
      finishTransaction: unsupportedError,
      manageSubscriptions: unsupportedError,
      addListener: () => ({ remove: () => {} }),
    } as unknown as NoraBillingModule)

export default NoraBilling
