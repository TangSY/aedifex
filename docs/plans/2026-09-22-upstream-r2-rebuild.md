# September 22 upstream integration implementation plan

> Execute the approved R2 adaptation with independent module ownership and sequential Git/install/build gates.

## Goal and protected inputs

Integrate upstream surface hosting, hosted duplication, units, export and Capture reliability while preserving Aedifex behavior. User approved the recommended R2 after the real 60-conflict dry-run. No deployment.

- Original main: `0c0906d74806c1035c459b498b33057ee9e6eb32`
- Common upstream base: `eacc2a939bec53529809b06f68123df2459b7961`
- Upstream target: `4191a4d2273deeb5fc92bc3e1240a5bc10b1083c`
- Review branch: `merge/upstream-2026-09-22-r2`

## Protection and recovery

Main is never reset. Original commits remain reachable through main; the effective binary patch, immutable inputs, dry-run and 182-path fork asset inventory are retained under `.git/sync-2026-09-22-*`. The 149 nonmerge historical commits contain overlapping rebuilds and must not be replayed mechanically. Reapply and review the effective base-to-main delta against upstream using three-way conflict evidence. Before main landing, recovery consists of returning to unchanged main after preserving the review branch; never discard user changes.

Preserve package identities, MIT attribution, persisted protocol identifiers, metadata JSON compatibility, AI/host, MCP/storage security, repository-local CLI, Plugin API v2/Nature, paint/terrain, IFC guards/WASM, Capture migration and prior interaction fixes. Exclude upstream hosted login, publication/agent marketplace and external plugin defaults. Keep the existing fork package version line.

## Execution and verification

- [x] Verify clean repositories, pull main, record immutable inputs and effective binary patch.
- [x] Create review branch from upstream and immediately pull; apply effective patch with three-way evidence.
- [ ] Reconcile Editor hosting/units/interaction changes and tests, preserving fork contracts.
- [ ] Reconcile Nodes/Viewer surfaces, duplication, geometry, Capture and isolation.
- [ ] Reconcile local CLI runtime and MCP unit operations; retain exclusion of marketplace files.
- [ ] Reconcile Core floor support, schema/metadata and package manifests; review all new brand references.
- [ ] Rebuild lock with `bun install`; run `bun run check-types`, `bun run test`, `bun run build`, `bun --filter @aedifex/mcp test`; fix actual regressions and rerun affected checks.
- [ ] Relink SaaS file packages using its existing workflow, run `pnpm install --force` and `pnpm --filter @aedifex-saas/web run build`; compare namespace warning baseline30.
- [ ] Review architecture, fork assets and public repository boundaries; commit reviewed integration.
- [ ] Return to main and immediately pull; merge-tree then normal --no-ff merge, manually reconcile each landing conflict against all three trees and reviewed integration.
- [ ] Validate final merged tree, commit required SaaS changes, push SaaS origin and Aedifex origin/github; independently verify remote SHAs. Never push upstream or deploy.

No automatic side selection, whole-tree replacement, merge-driver source overrides, local Docker build, production access, or weakening verification gates.
