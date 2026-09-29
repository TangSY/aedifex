# September 29 upstream integration

User approved all new features, including WebXR, after the 104-conflict dry-run. No deployment.

## Protected inputs and recovery
Original main 93023b3c4063381b0f4a478f0c96011f53391eec; base 4191a4d2273deeb5fc92bc3e1240a5bc10b1083c; upstream 64fc7d8b6809ea1df253e17ec9da84391582da06; SaaS 939df42fddb3a677372cf05061968167aa742f11. Both initially clean. Original main was preserved throughout review; landing uses a normal merge. Immutable input record, effective binary patch, dry-run conflicts, 155 historical commits and 184 fork-only assets are retained under .git/sync-2026-09-29-*. R2 review branch starts from upstream; preserve effective fork delta, never replay overlapping reconstruction commits blindly. Recovery before landing is return to original main with review branch retained. No worktree, reset of main, bulk side selection, or merge-driver overrides.

## Scope and constraints
Integrate all upstream core features including wall lifecycle/curtain walls, procedural v2/MCP, Architect host/drawing features, XR and thumbnails. Adapt third-party WebXR to @aedifex and Plugin API v2; inspect actual third-party source/license before integration. Preserve AI/host, MCP security/storage, local CLI, Nature/defaultInstalled, explicit deletable, metadata JSON and persisted protocol identifiers, branding and latest getColorAt fix. Existing exclusions of npm publishing, private hosted services and AI configs remain. User request for all features overrides earlier proposal to exclude XR. No fetching private services or deployment.

## Tasks
- [x] Recheck clean repos and pull; record inputs and effective patch; create review branch and apply three-way patch.
- [x] Nodes and Viewer: individually resolve geometry/rendering conflicts and preserve new features plus fork fixes.
- [x] Editor package: individually resolve interaction/UI conflicts and preserve AI/customizations.
- [x] Core/MCP: individually resolve schema/registry/operations conflicts, Plugin v2 and metadata compatibility.
- [x] Root/apps/WebXR: dependency manifests, standalone and SaaS integration, external plugin compatibility and brand audit.
- [x] Review task results; run install, full tests, build, types, MCP and targeted XR tests; fix regressions.
- [x] SaaS file relink/install/build; confirm no unrelated changes and review architecture/compatibility.
- [x] Commit review branch; reconcile normal merge to main and complete final verification.
- [ ] Push both repositories to all required remotes; no deployment.

## Ownership and interface review
Nodes/Viewer and Editor share exported types but edit separate scopes: coordinate interface issues through controller, install/build gates wait for all. Core owns shared schema; consumers adapt after stabilization. Root owns package manifests, Git/index, dependency graph, external plugin and SaaS. Agents may edit only assigned source scopes; no Git mutation or installs/builds. Controller reviews all conflict decisions and conducts final cross-module checks.

## Progress
Initial three-way apply required excluding already-reviewed fork-deleted publish/eval files and the upstream-deleted opening documentation component (fork difference was import branding only). Actual source conflicts remain visible for individual resolution. Lockfile regenerated only after manifest adaptation.

## Integration audit
- Upstream range: 140 commits, 627 files, +69,684/-4,754. Main themes: wall lifecycle and curtain walls; procedural recipes v2 and design MCP tools; atomic plugin loading; batching, lights and thumbnails; generic drawing/Architect host surfaces; WebXR.
- Third-party XR is vendored as an MIT workspace package at source commit `31063230d0cd5b244b04eca12c6e31b5b757cb5e`. Host integration is shared by standalone blank/saved scenes and SaaS. Existing explicit per-project plugin choices remain; old projects can install WebXR through Plugins. Private upstream services remain outside the public feature set.
- Preserve all fork-only assets except `packages/nodes/src/shared/opening-documentation-fields.tsx`: upstream removed this module, and the effective fork delta contained package-name-only imports. No behavior is lost by accepting its removal.
- Source conflict decisions are recorded in `.git/sync-2026-09-29-{editor,nodes-viewer,core-mcp}-report.md`. Keep JSON metadata, roof/cladding slots, hosted placement, screenshot capture, AI/host integration, MCP storage/security, local CLI and persisted identifiers.
- Browser check: gstack browse reached the local production runtime (HTTP 200), displayed WebXR/Plugins/VR controls and unsupported-device fallback. Headless browser has no usable WebGPU/WebGL; native headset rendering, controllers and session transitions require hardware acceptance.
- Review validation completed; no deployment. Landing results follow below.

## Validation and compatibility follow-up
- `bun install`: passed; regenerated Bun lock with Three/iwer patches.
- `bun run check-types`: 13/13 tasks passed. `AEDIFEX_PORTABLE_BUILD=1 bun run build`: 8/8 tasks passed.
- `bun --filter @aedifex/mcp test`: 455 passed, zero failed, 2,149 assertions. Shared bridge/tool patch guard retains atomic preflight, cascades, identity/schema protection, registered plugin defaults and explicit deletion protection.
- WebXR: 204 passed. Dynamic JS plugins now receive an atomic API v2 `deletable` preflight; malformed manifests cannot partially register. Positive plugin fixtures use the v2 contract.
- CLI stage and smoke passed after final build: 51 MCP tools, independent MCP-only save/list, editor startup and project round-trip.
- SaaS: `pnpm install --force`, package sync, `pnpm --filter @aedifex-saas/web run build` passed; direct TypeScript check passed; final tests 102 files / 1,311 tests passed. Build warnings 34 versus previous 30, four new WebXR server-stub references with real client exports preserved.
- SaaS exposes `validate_design` and `place_design` through one shared tool list and browser executor. Node MCP and browser placement share one operation; browser autosave owns SaaS persistence. Upstream's intentional v2 design placement gate remains: v2 validates, placement currently accepts v1.
- Source/brand/asset checks passed. Native XR hardware validation remains outstanding; no hardware support claim is made.

- Final full test gate: 14/14 tasks passed; Core 3,332; Nodes 3,601 with one pre-existing skip; Viewer 413; Editor 1,318 plus AI 688; MCP 455; WebXR 204; CLI 46. No failing tests.

## Main landing reconciliation
- Review commits: `bc46c7185`, `41b6f4bc2`, `571415e51`, `91d618836`; SaaS integration: `d8343fa`.
- Normal merge into freshly pulled main produced 101 conflicts, individually reconciled using the base-to-fork delta and reviewed implementation. No automatic side selection.
- Regenerated lock is identical to the reviewed lock. Final source differs only in equivalent explicit early-return guards/commentary for `setNodeAction` and Aedifex wording in MCP annotation fixtures.
- Landing source tree before this report update: `2678a12086de71d8b5acce80db70c0031bd07eb7`; review tree: `a07b4d389faa2746aaddf3cf5460c7de01ff8526`. These are intentionally not identical for the two reviewed differences above.
- Final landing Core tests: 3,332 passed; MCP: 455 passed, zero failed. No unresolved conflict entries or source markers.
- Diff whitespace check passes excluding the unchanged third-party font license and Three patch context; those upstream/vendor bytes are preserved.
- Final landing `bun run check-types`: 13/13 passed; `AEDIFEX_PORTABLE_BUILD=1 bun run build`: 8/8 passed. Full review test suite and SaaS validation remain applicable; the only runtime landing difference was covered by the repeated Core suite.
