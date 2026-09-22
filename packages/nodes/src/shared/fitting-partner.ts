import type { AnyNodeId } from '@aedifex/core'
import { metadataRecord } from './node-metadata'

export function fittingPartnerId({
  metadata,
  runId,
}: {
  metadata: unknown
  runId: string
}): AnyNodeId | undefined {
  const record = metadataRecord(metadata)
  if (!record.altJoint || !Array.isArray(record.partnerIds)) return undefined
  const partner = record.partnerIds.find(
    (id): id is string => typeof id === 'string' && id !== runId,
  )
  return partner as AnyNodeId | undefined
}
