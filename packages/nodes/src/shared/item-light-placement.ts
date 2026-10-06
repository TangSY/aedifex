import { metadataRecord } from './node-metadata'

export function canRegisterItemLight(metadata: unknown): boolean {
  return metadataRecord(metadata).isNew !== true
}
