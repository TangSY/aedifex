# September 29 upstream integration

User approved all new features, including WebXR, after the 104-conflict dry-run. No deployment.

## Protected inputs and recovery
Original main 93023b3c4063381b0f4a478f0c96011f53391eec; base 4191a4d2273deeb5fc92bc3e1240a5bc10b1083c; upstream 64fc7d8b6809ea1df253e17ec9da84391582da06; SaaS 939df42fddb3a677372cf05061968167aa742f11. Both initially clean. Main remains unchanged. Immutable input record, effective binary patch, dry-run conflicts, 155 historical commits and 184 fork-only assets are retained under .git/sync-2026-09-29-*. R2 review branch starts from upstream; preserve effective fork delta, never replay overlapping reconstruction commits blindly. Recovery before landing is return to original main with review branch retained. No worktree, reset of main, bulk side selection, or merge-driver overrides.

## Scope and constraints
Integrate all upstream core features including wall lifecycle/curtain walls, procedural v2/MCP, Architect host/drawing features, XR and thumbnails. Adapt third-party WebXR to @aedifex and Plugin API v2; inspect actual third-party source/license before integration. Preserve AI/host, MCP security/storage, local CLI, Nature/defaultInstalled, explicit deletable, metadata JSON and persisted protocol identifiers, branding and latest getColorAt fix. Existing exclusions of npm publishing, private hosted services and AI configs remain. User request for all features overrides earlier proposal to exclude XR. No fetching private services or deployment.

## Tasks
- [x] Recheck clean repos and pull; record inputs and effective patch; create review branch and apply three-way patch.
- [ ] Nodes and Viewer: individually resolve geometry/rendering conflicts and preserve new features plus fork fixes.
- [ ] Editor package: individually resolve interaction/UI conflicts and preserve AI/customizations.
- [ ] Core/MCP: individually resolve schema/registry/operations conflicts, Plugin v2 and metadata compatibility.
- [ ] Root/apps/WebXR: dependency manifests, standalone and SaaS integration, external plugin compatibility and brand audit.
- [ ] Review task results; run install, full tests, build, types, MCP and targeted XR tests; fix regressions.
- [ ] SaaS file relink/install/build; confirm no unrelated changes and review architecture/compatibility.
- [ ] Commit review branch; normal merge to main with three-way reconciliation, final verification, all required pushes; no deployment.

## Ownership and interface review
Nodes/Viewer and Editor share exported types but edit separate scopes: coordinate interface issues through controller, install/build gates wait for all. Core owns shared schema; consumers adapt after stabilization. Root owns package manifests, Git/index, dependency graph, external plugin and SaaS. Agents may edit only assigned source scopes; no Git mutation or installs/builds. Controller reviews all conflict decisions and conducts final cross-module checks.

## Progress
Initial three-way apply required excluding already-reviewed fork-deleted publish/eval files and the upstream-deleted opening documentation component (fork difference was import branding only). Actual source conflicts remain visible for individual resolution. Lockfile regenerated only after manifest adaptation.
