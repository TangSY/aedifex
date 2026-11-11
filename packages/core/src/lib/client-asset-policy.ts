import { parsePublicAssetOrigins } from './restricted-asset-read'

type ClientAssetPolicy = Readonly<{
  origins: readonly string[] | null
  version: number
}>

let current: ClientAssetPolicy = Object.freeze({ origins: null, version: 0 })
const listeners = new Set<() => void>()

export function getClientAssetPolicy(): ClientAssetPolicy {
  return current
}

export function configureClientAssetPolicy(value: unknown): void {
  const parsed = parsePublicAssetOrigins(value)
  if (JSON.stringify(parsed) === JSON.stringify(current.origins)) return
  current = Object.freeze({
    origins: parsed ? Object.freeze(parsed) : null,
    version: current.version + 1,
  })
  for (const listener of listeners) listener()
}

export function subscribeClientAssetPolicy(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
