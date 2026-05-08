import { UseQueryOptions } from '@tanstack/react-query'
import { auth$ } from '@/states/auth'

const HOST = 'https://a.inks.page'

export interface NoraIosEntitlement {
  status: string
  productId?: string | null
  expiresAt?: string | null
  willRenew?: boolean | null
  linkedEmail?: string | null
}

export interface NoraEntitlement {
  plan: string
  source: 'none' | 'stripe' | 'app_store'
  email?: string | null
  ios?: NoraIosEntitlement | null
}

export interface PrepareIosPurchaseResponse {
  appAccountToken: string
  email: string
  entitlement: NoraEntitlement
}

export interface SyncIosTransactionResponse {
  entitlement: NoraEntitlement
}

export interface WebAuthLinkResponse {
  token?: string | null
}

const defaultEntitlement: NoraEntitlement = {
  plan: 'free',
  source: 'none',
}

function getErrorMessage(payload: any, fallback?: string) {
  return payload?.error?.json?.message || payload?.message || fallback || 'Request failed'
}

async function callNoraApi<T>(path: string, init?: RequestInit, authorization = auth$.accessToken.get()): Promise<T> {
  const headers = new Headers(init?.headers)
  if (authorization) {
    headers.set('authorization', authorization)
  }
  const method = init?.method?.toUpperCase()
  if ((init?.body || (method && method !== 'GET' && method !== 'HEAD')) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  const res = await fetch(`${HOST}/api/${path}`, {
    ...init,
    headers,
  })

  const rawText = await res.text()
  const payload = (() => {
    try {
      return rawText ? JSON.parse(rawText) : null
    } catch {
      return null
    }
  })()
  if (!res.ok || payload?.error) {
    const fallback = rawText ? `HTTP ${res.status}: ${rawText.slice(0, 200)}` : `HTTP ${res.status}`
    throw new Error(getErrorMessage(payload, fallback))
  }
  return payload?.result?.data as T
}

export const getMeQuery = (options?: Partial<UseQueryOptions<NoraEntitlement>>) => ({
  queryKey: ['me'],
  queryFn: async () => {
    const authorization = auth$.accessToken.get()
    if (!authorization) {
      return defaultEntitlement
    }
    return callNoraApi<NoraEntitlement>('nora.me')
  },
  staleTime: 15 * 60 * 1000, // 15 minutes
  ...options,
})

export const fetchWebAuthLink = (accessToken: string) => callNoraApi<WebAuthLinkResponse>('users.link', undefined, accessToken)

export const prepareIosPurchase = () => callNoraApi<PrepareIosPurchaseResponse>('nora.prepareIosPurchase', { method: 'POST' })

export const syncIosTransaction = (signedTransactionInfo: string) =>
  callNoraApi<SyncIosTransactionResponse>('nora.syncIosTransaction', {
    method: 'POST',
    body: JSON.stringify({ signedTransactionInfo }),
  })
