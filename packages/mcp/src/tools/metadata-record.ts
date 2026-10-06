export function metadataRecord(metadata: unknown): Record<string, unknown> | null {
  return metadata !== null && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : null
}
