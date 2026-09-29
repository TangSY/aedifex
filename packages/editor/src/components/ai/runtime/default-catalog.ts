import type { CatalogProvider } from '../contracts/runtime'
import {
  resolveCatalogSlug,
  generateCatalogSummary,
} from '../ai-catalog-resolver'

/**
 * Default CatalogProvider for OSS deployments.
 *
 * Wraps the bundled @aedifex/core catalog registry. If a deployment ran
 * `loadPlugin(builtinPlugin)` without registering furniture assets, the
 * `generateSummary()` output is the empty string — the system prompt
 * adapts gracefully ("furniture tools unavailable in this deployment").
 *
 * SaaS provides its own CatalogProvider that fetches a per-user view
 * (plan tier + purchased asset packs) instead of the static registry.
 */
export function createDefaultCatalogProvider(): CatalogProvider {
  return {
    resolveSlug: (slug) => resolveCatalogSlug(slug),
    generateSummary: () => generateCatalogSummary(),
  }
}
