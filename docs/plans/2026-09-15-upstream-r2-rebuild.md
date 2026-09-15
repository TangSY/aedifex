# September 15 upstream integration

## Approved scope and immutable inputs

User approved R2 integration and normal final merge/push after the 110-conflict dry-run, including Capture package migration while retaining repository-local CLI operation. Remove the README Linux DO link. No deployment.

- Original main: `46731aed12a381a3421191c8a5aa8efe1d93cc17`
- README cleanup / protected main: `2968cee12`
- Common upstream base: `c3afd161d67fdf5cedb28a128208515c5a90ac47`
- Upstream target: `eacc2a939bec53529809b06f68123df2459b7961`
- Original SaaS: `be267b3c6ae9b80933e1ec4bd72214caba514788`
- Review branch: `merge/upstream-2026-09-15-r2`

## Protection and recovery

Main is never reset. The effective base-to-main binary patch, original SHA, dry-run paths and fork asset inventory are retained under `.git/sync-2026-09-15-*`. The 145 historical non-merge commits overlap prior rebuilds and must not be blindly replayed. Audit the effective tree delta instead.

Retain branding, package identities, MIT attribution, persisted protocol identifiers, AI/host contracts, MCP/CLI security and storage, Plugin API v2/Nature, paint/terrain, IFC guards/WASM and the September 8 metadata/history/drone/window/export corrections. Move Capture contracts into Core and layers into Viewer; do not restore retired packages. Exclude upstream hosted sign-in, npm publishing and agent marketplace configuration. Keep generic extension APIs.

Resolve source conflicts individually with all three trees and call sites. Never use strategy overrides, bulk side selection or whole-tree replacement. Git mutations, installs and builds are sequential. Independent module edits use disjoint ownership; reviewers inspect the resulting integration. Failed validation leaves the review branch available and main untouched. Final normal merge may need a second round of individually reviewed conflicts; the same constraints apply.

## Tasks

- [x] Inspect repositories, perform dry-run, record inputs and commit README cleanup.
- [x] Reconcile Editor interaction/export/history and AI/host integration.
- [x] Reconcile Nodes/Viewer geometry, rendering, paint and Capture relocation.
- [x] Reconcile local CLI, MCP execution/security and IFC import.
- [x] Reconcile Core, app wiring, identity, manifests and documentation.
- [x] Regenerate dependencies; pass build, types, MCP and relevant/full tests.
- [ ] Adapt SaaS Capture/Three dependencies; relink packages and pass web build.
- [x] Review compatibility/architecture/public boundaries and fix confirmed issues.
- [ ] Commit integration, normal merge to main, validate final state and push required remotes.

## Verification

`bun install`; `bun run test`; `bun run build`; `bun run check-types`; `bun --filter @aedifex/mcp test`; SaaS `pnpm install --force` and `pnpm --filter @aedifex-saas/web run build`. Compare known SaaS namespace warnings with baseline 30. Never build Docker locally or deploy.

Validation on the integration tree: full tests 13/13 tasks; types 11/11; portable build 8/8; local staged CLI smoke passed, including MCP-only startup and scene round-trip.
