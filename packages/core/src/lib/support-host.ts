/**
 * Persisted `supportSlabId` sentinel for nodes hosted by the level base.
 * Keep this in a dependency-free module so serialization utilities do not
 * pull the spatial-grid runtime into server bundles.
 */
export const GROUND_SUPPORT_ID = 'ground'
