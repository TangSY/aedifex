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
- [x] Reconcile Editor hosting/units/interaction changes and tests, preserving fork contracts.
- [x] Reconcile Nodes/Viewer surfaces, duplication, geometry, Capture and isolation.
- [x] Reconcile local CLI runtime and MCP unit operations; retain exclusion of marketplace files.
- [x] Reconcile Core floor support, schema/metadata and package manifests; review all new brand references.
- [x] Rebuild lock with `bun install`; run `bun run check-types`, `bun run test`, `bun run build`, `bun --filter @aedifex/mcp test`; fix actual regressions and rerun affected checks.
- [x] Relink SaaS file packages using its existing workflow, run `pnpm install --force` and `pnpm --filter @aedifex-saas/web run build`; compare namespace warning baseline30.
- [x] Review architecture, fork assets and public repository boundaries; commit reviewed integration.
- [x] Return to main and immediately pull; merge-tree then normal --no-ff merge, manually reconcile each landing conflict against all three trees and reviewed integration.
- [x] Validate final merged tree, commit required SaaS changes, push SaaS origin and Aedifex origin/github; independently verify remote SHAs. Never push upstream or deploy.

No automatic side selection, whole-tree replacement, merge-driver source overrides, local Docker build, production access, or weakening verification gates.

## Integration validation

Review tree `fd1398c78`: types 11/11, full test tasks 13/13 (Nodes 3401 pass, 1 existing skip, 0 fail), portable build 8/8, MCP 393 pass/0 fail. Local staged CLI smoke passed: 49 MCP tools without a web runtime and a saved scene round-trip with the local editor. SaaS relink/install and web build EXIT0, 1010 pages, 30 namespace import warnings matching baseline; no SaaS tracked changes.

Reviews retained all 182 fork-only paths, found no new private-domain/credential patterns and passed the OSS boundary gate. Corrected new metadata object-only assumptions, kept 2D unit focus in editor-owned extensions, and isolated browser-schema bundle tests in fresh Bun processes without weakening import/runtime assertions. Excluded upstream-only Next promotional media and marketplace publishing files. Existing persisted compatibility identifiers and MIT attribution remain intact.

## Normal main landing

Merge `f82206957d9c1065f8e66061d117d83688f82940` has original main `0c0906d74806c1035c459b498b33057ee9e6eb32` as its first parent and reviewed R2 `c337eddca2bcdb64cce9d597436be83b9f27d1cb` as its second parent. All 44 landing conflicts were read and reconciled individually. The resulting Git tree exactly matched R2 (`db032f28828771db1e9eac0e1a5cb68c0d5d91b5`), including the regenerated lockfile.

Final merged-tree checks passed: types 11/11, portable build 8/8, MCP 393/0. The identical tree's full test run passed 13/13 tasks. Both Aedifex remotes accepted the merge; SaaS had no tracked changes and was not pushed. This completion note is the only subsequent change. No deployment.
