# September 8 upstream R2 rebuild

> Execute with superpowers:subagent-driven-development; user authorized the recommended R2 scope on September 8.

**Goal:** Integrate upstream c712f576..c3afd161 while preserving main db605148 behavior and safely pushing both Aedifex remotes and necessary SaaS changes.
**Architecture:** Rebuild on upstream c3afd161 using the effective c712f576..db605148 fork patch with three-way application, manually resolving each conflict. This includes the 65-file last-landing delta absent from the eleven prior R2 commits. Original main remains untouched until validation. Normal final merge, no automatic side selection or tree replacement.
**Tech stack:** Bun, TypeScript, React/Three.js, Zod, pnpm/Next.js.
**Spec:** September 8 automation instructions and user approval in the current task; repository AGENTS.md and architecture pages.

## Global Constraints
- Preserve @aedifex/*, Plugin API v2, required deletable, AI/host integration, MCP security/storage/CLI local-only behavior, Nature, paint slots, terrain offsets, IFC cycle guards/WASM, compass, server constants, and all persisted compatibility identifiers.
- Do not use -X, checkout --ours/--theirs, merge drivers, reset main, or wholesale tree replacement. No deployment or Docker build.
- Keep changes inside the two authorized repositories. Git mutations/build/install run sequentially. Read-only reviews may run in parallel; independent implementation ownership follows user AGENTS.md.
- Zod upgrade requires nodeUnion discriminator fix and legacy metadata compatibility review; do not blindly retain old pins or relax validation.
- No npm publication or restoration of release workflows/private product code.

## Recovery and immutable inputs
- Original main db6051485927d7643857ddc05a611b3e9f1429ac remains reachable on main, origin/main, github/main.
- Upstream c3afd161d67fdf5cedb28a128208515c5a90ac47; common base c712f576fe16de9c0185824dffa21e643a401562.
- Original SaaS main 4f2fbe6d8faad70bc5b424f4e19f4b4f2610b940.
- .git/sync-2026-09-08 retains effective binary patch, last-landing delta and path inventory. No uncommitted user work existed. A failed build leaves review branch intact and main unmodified; do not reset to recover.

### Task 1: Reconcile editor and snapshot interactions
- [x] Read full conflict files and relevant tools/interaction-scope/selection architecture.
- [x] Resolve packages/editor/src conflicts using c712f576 (base), db605148 (fork), c3afd161 (upstream). Keep FSM/snapshot lifetime improvements and AI/host/compass behavior.
- [x] Review cleanly applied files for old mode/tool writers; run editor suites after shared install.

### Task 2: Reconcile Nodes and rendering
- [x] Read node-definitions/renderers/systems architecture and conflicting Nodes/Viewer files.
- [x] Preserve exact cabinet sizing/run semantics, batching and dirty lifecycle while retaining fork paint/terrain/plugin behavior.
- [x] Validate nodes/viewer focused and full suites after shared install.

### Task 3: Reconcile schemas, dependencies, MCP and repository boundaries
- [x] Resolve remaining manifests, graph-schema, IFC and MCP conflicts using three immutable versions.
- [x] Adopt upstream fixed Zod union, align producer versions and check fork metadata consumers and legacy scene load.
- [x] Rebuild bun.lock, audit all required paths for branding and public-boundary violations, including newly added upstream files.
- [x] Account for all 170 fork-only paths and last-landing delta; no arbitrary restoration of retired upstream code.

### Task 4: Full validation and independent review
- [x] bun install; bun run test; bun run build; bun run check-types; bun --filter @aedifex/mcp test must pass.
- [x] Independent spec/quality and architecture review; fix confirmed regressions and rerun covering tests.
- [x] SaaS exact file-link refresh, pnpm install --force, pnpm --filter @aedifex-saas/web run build exit 0. Compare namespace/import.meta warnings with 30/6 baseline.

### Task 5: Commit, land, verify and push
- [ ] Inspect complete status/diff; make logical Conventional Commits with verification evidence.
- [ ] main checkout then immediate pull --ff-only; merge-tree preflight then normal --no-ff merge; any conflicts individually reviewed with validated branch as semantic reference, never batch selected.
- [ ] Final required validation; push Aedifex main to origin and github, never upstream. Push necessary SaaS commits to origin. No deployment.

## Validation evidence before landing
- Final full suite: 16/16 tasks; build 10/10; types 12/12; MCP 354 pass / 0 fail.
- SaaS build exit 0, 938 pages, 30 attempted-import warnings and 5 import.meta mentions.
- Confirmed regressions corrected: legacy JSON metadata, plugin history dirty guards, suspended drone inputs, window free-follow writes, batch export marker.
- Recursive metadata may cause optional compiled schemas to decline compilation and use the documented normal-parser fallback; preserving historical data takes precedence.
- Initial landing preflight reports 58 conflicts; resolve each against original main and the reviewed R2 implementation.
