export function isMetadataRecord(metadata: unknown): metadata is Record<string, unknown> {
  return metadata !== null && typeof metadata === 'object' && !Array.isArray(metadata)
}

export function metadataRecord(metadata: unknown): Record<string, unknown> {
  return isMetadataRecord(metadata) ? metadata : {}
}
