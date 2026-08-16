/** Register the Cohub account-backed LLM adapter. */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { DEFAULT_COHUB_API_BASE_URL } from '@deepseek-ai/dsh-cohub-account'
import type { CohubAccountService } from '@deepseek-ai/dsh-cohub-account'
import {
  CohubAdapter,
  DEFAULT_COHUB_STREAM_IDLE_TIMEOUT_MS,
} from './adapter.ts'
import type { CohubConnectionOptions } from './adapter.ts'
import { COHUB_PROVIDER_ROUTE } from './protocol.ts'

export {
  CohubAdapter,
  DEFAULT_COHUB_STREAM_IDLE_TIMEOUT_MS,
} from './adapter.ts'
export type { CohubAdapterOptions, CohubConnectionOptions } from './adapter.ts'
export {
  COHUB_PROVIDER_ROUTE,
  cohubModelId,
  parseCatalog,
  parseCohubModelId,
} from './protocol.ts'
export type { CohubCatalogModel } from './protocol.ts'

export const name = 'llm-cohub'
export const inject = ['llm', 'cohubAccount']

export interface Config {
  apiBaseUrl?: string
  spaceId: string
  streamIdleTimeoutMs?: number
}

export const Config: z<Config> = z.object({
  apiBaseUrl: z.string().default(DEFAULT_COHUB_API_BASE_URL),
  spaceId: z.string().required(),
  streamIdleTimeoutMs: z.number()
    .min(Number.MIN_VALUE)
    .max(MAX_TIMER_DELAY_MS)
    .default(DEFAULT_COHUB_STREAM_IDLE_TIMEOUT_MS),
})

function nonBlank(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`llm-cohub: ${field} must be a non-blank string`)
  }
  return value
}

function normalizeUrl(value: string): string {
  const parsed = new URL(nonBlank(value, 'apiBaseUrl').replace(/\/+$/, ''))
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new TypeError('llm-cohub: apiBaseUrl must use HTTP or HTTPS')
  }
  return parsed.toString().replace(/\/$/, '')
}

export function resolveConnection(config: Config): CohubConnectionOptions {
  const streamIdleTimeoutMs = config.streamIdleTimeoutMs ?? DEFAULT_COHUB_STREAM_IDLE_TIMEOUT_MS
  if (!Number.isFinite(streamIdleTimeoutMs) || streamIdleTimeoutMs <= 0 || streamIdleTimeoutMs > MAX_TIMER_DELAY_MS) {
    throw new TypeError(`llm-cohub: streamIdleTimeoutMs must be positive and no greater than ${String(MAX_TIMER_DELAY_MS)}`)
  }
  return Object.freeze({
    apiBaseUrl: normalizeUrl(config.apiBaseUrl ?? DEFAULT_COHUB_API_BASE_URL),
    spaceId: nonBlank(config.spaceId, 'spaceId'),
    streamIdleTimeoutMs,
  })
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    cohubAccount: CohubAccountService
  }
}

export function apply(ctx: Context, config: Config): void {
  const connection = resolveConnection(config)
  const adapter = new CohubAdapter({
    connection: () => connection,
    resolveAccessToken: () => ctx.cohubAccount.getAccessToken(),
    resolveAttachments: () => ctx.get('attachments'),
  })
  ctx.llm.registerAdapter([COHUB_PROVIDER_ROUTE], adapter)
  ctx.effect(() => {
    const unsubscribe = ctx.cohubAccount.snapshot.subscribe(() => {
      ctx.emit('llm/adapters-updated')
    })
    return () => {
      unsubscribe()
      adapter.close()
    }
  }, 'llm-cohub: account and request lifetime')
}
