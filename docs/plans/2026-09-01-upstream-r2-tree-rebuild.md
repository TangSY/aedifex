# Upstream R2 Tree Rebuild Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild Aedifex on `upstream/main@c712f576` while preserving the current fork behavior from `main@ebd82837` and safely landing the 17 upstream commits after `4c34032c`.

**Architecture:** Treat the three immutable trees `OLD_UPSTREAM=4c34032c`, `FORK_TIP=ebd82837`, and `NEW_UPSTREAM=c712f576` as the source of truth. Start from `NEW_UPSTREAM`, replay the effective `OLD_UPSTREAM..FORK_TIP` fork delta by ownership layer, and resolve hotspots against the new upstream architecture rather than restoring deleted files. Keep `main` untouched until all Aedifex and SaaS gates pass.

**Tech Stack:** Bun, TypeScript 6, React 19, Three.js 0.185, Turborepo, Vitest/Bun tests, pnpm, Next.js 16.

---

### Task 1: Lock the rebuild inputs and inventory the fork contract

**Files:**
- Create: `docs/plans/2026-09-01-upstream-r2-tree-rebuild.md`
- Inspect: `AGENTS.md`, `wiki/architecture/**`, `package.json`, `packages/**`, `apps/editor/**`

**Steps:**
1. Verify Aedifex and SaaS are clean and have no merge/rebase/cherry-pick state.
2. Confirm `upstream/main` and GitHub `refs/heads/main` both equal `c712f576fe16de9c0185824dffa21e643a401562`.
3. Create `merge/upstream-2026-09-01-r2` tracking `upstream/main`, then immediately run `git pull --ff-only`.
4. Record changed paths for `4c34032c..c712f576` and fork paths for `4c34032c..ebd82837`.
5. Classify the fork delta into repository identity, AI/host, MCP/CLI/security, plugin/paint, domain hotspots, documentation, tests, and generated lockfile.
6. Commit this plan as `docs(sync): plan September upstream R2 rebuild`.

### Task 2: Restore repository identity and public-package boundaries

**Files:**
- Modify: `AGENTS.md`, root manifests/configuration, `README*`, `LICENSE`, `SETUP.md`, `SECURITY.md`, `CHANGELOG.md`
- Modify: package manifests under `apps/`, `packages/`, and `tooling/`
- Restore only if present in the fork contract: Aedifex logos, public legal pages, Docker/CLI local-runtime files

**Steps:**
1. Reapply `@aedifex/*`, `@repo/typescript-config`, repository metadata, environment names, binaries, and UI branding from the fork delta.
2. Keep the MIT Pascal attribution and every compatibility identifier listed in `AGENTS.md`.
3. Keep CLI/Core/Capture Protocol/Capture Viewer repository-local and private; do not restore npm release scripts or upstream release workflows.
4. Exclude `.claude/`, upstream agent-only additions that violate the public-repo policy, FUNDING, private domains, secrets, and commercial SaaS code.
5. Retain new upstream license files where useful, rewritten only for Aedifex package metadata without changing legal attribution.
6. Run manifest/package-name/public-boundary guards and `git diff --check`.
7. Commit as `chore(sync): restore Aedifex package boundaries`.

### Task 3: Restore AI, host contracts, and editor-owned integrations

**Files:**
- Restore/Modify: `apps/editor/app/api/ai/**`, `packages/editor/src/components/ai/**`
- Modify: host contracts and editor integration under `packages/editor/src/**` and `apps/editor/**`
- Test: fork AI, host upload/delete, screenshot, selection, and interaction suites

**Steps:**
1. Reapply fork-only AI runtime, API routes, prompts, tools, execution/store/perception code, and tests.
2. Preserve neutral host upload/delete/screenshot contracts and SaaS-safe editor exports.
3. Adapt imports and registration to upstream registry-owned tools, including the roof tool now under `packages/nodes/src/roof/`.
4. Preserve 2D/3D parity, interaction scopes, live overrides, snapping modes, and selection behavior.
5. Run focused AI/editor tests and type checks for the touched packages.
6. Commit as `feat(ai): restore Aedifex AI and host integrations`.

### Task 4: Restore MCP, CLI, storage, and security contracts

**Files:**
- Restore/Modify: `packages/mcp/**`, `packages/cli/**`, MCP-facing Core types, Docker/local runtime files
- Test: MCP transport, live sync, scene lifecycle, SQLite concurrency, CORS, safe-fetch, templates, and CLI runtime suites

**Steps:**
1. Reapply MCP tools, templates, prompts, resources, storage adapters, live sync, and scene authority behavior.
2. Keep strict loopback CORS, token headers, Host validation, safe-fetch controls, SQLite write serialization, and compatible storage directories/server name.
3. Fold upstream `publishLiveSceneSnapshot` persistence warnings into the fork MCP result contracts without weakening security.
4. Keep CLI repository-local with bundled runtime; do not restore npm install/update/release behavior.
5. Run focused MCP and CLI tests.
6. Commit as `fix(mcp): restore storage security and local runtime contracts`.

### Task 5: Restore plugins, registry contracts, Nature, and paint slots

**Files:**
- Restore/Modify: `packages/plugin-trees/**`
- Modify: Core registry, Nodes built-in plugin, Editor plugin panels, roof/roof-segment paint slots
- Test: registry, plugin, Nature, tree fallback, and paint-slot suites

**Steps:**
1. Restore Plugin API v2, required `deletable`, project installation metadata, and generic registry tree rows.
2. Restore the local `@aedifex/plugin-trees` Nature package and default installation without adding Pascal Bones, Mint, or Streetscape dependencies.
3. Keep upstream registry-owned roof placement and move tools; adapt fork paint-slot and AI hooks to the new definitions.
4. Run registry/nodes/editor/plugin-trees focused tests.
5. Commit as `fix(plugins): restore Aedifex plugin and paint contracts`.

### Task 6: Reconcile the domain hotspots against the new upstream architecture

**Files:**
- Modify/Test: `packages/nodes/src/{roof,roof-segment,dormer,lean-to-extension,cabinet,wall,window,gutter}/**`
- Modify/Test: related Core, Viewer, and Editor files identified by the fork delta

**Steps:**
1. Build a per-hotspot behavior checklist by comparing `4c34032c`, `ebd82837`, and `c712f576` versions.
2. Keep the upstream roof tool relocation under Nodes; port fork AI/paint/terrain behavior into the new files and do not resurrect deleted Editor roof files.
3. Keep upstream dormer `window-layout` architecture; port only fork behavior not represented by the replacement and do not restore deleted window assembly files.
4. Keep upstream cabinet constraints/finishes and lean-to miter model; reapply fork-specific capabilities, AI descriptions, paint slots, terrain/support behavior, and tests.
5. Preserve wall/window terrain support offsets, wall-local rotations, live override performance, 2D/3D parity, and single-undo semantics.
6. Run each subsystem's focused tests after its edit, then run combined Core/Nodes/Viewer/Editor tests.
7. Commit logical hotspot adaptations separately, using `fix(<scope>): ...` messages.

### Task 7: Rebuild generated state and audit identity, compatibility, and architecture

**Files:**
- Regenerate: `bun.lock`
- Inspect: `packages/`, `apps/`, `bin/`, `tooling/`, `tests/`, `examples/`, `docs/`, `wiki/`

**Steps:**
1. Run `bun install` to regenerate the lockfile.
2. Search all required paths for active Pascal package/brand identifiers; keep only legal, historical, persisted-data, HTTP, MCP, storage, and userData allowlist entries.
3. Scan the public diff for secrets, internal domains, `.env` files, `.claude/`, commercial-only code, and release workflows.
4. Verify Core/Viewer/Editor layer boundaries, registry ownership, viewer isolation, and absence of unresolved conflict markers or dynamic imports.
5. Run Biome on changed files and `git diff --check`.
6. Commit remaining type or branding fixes separately.

### Task 8: Run the complete Aedifex verification gate

**Steps:**
1. Run `bun run test`; require zero failed tasks/tests.
2. Run `bun run build`; require every task to pass.
3. Run `bun run check-types`; require zero errors.
4. Run `bun --filter @aedifex/mcp test`; require zero failures.
5. Re-run hotspot suites for AI, roof, dormer, lean-to, cabinet, wall/window, IFC, plugins, CLI, and MCP.
6. Record exact counts and warnings in the integration commit.

### Task 9: Verify the SaaS file-link integration

**Files:**
- Modify only if required: `/Users/tangshiying/hxkj/aedifex-saas/`

**Steps:**
1. Reconfirm the SaaS repository is clean.
2. Remove only the linked `node_modules/@aedifex/{core,editor,viewer,mcp}` directories.
3. Run `pnpm install --force`.
4. Run `pnpm --filter @aedifex-saas/web run build`; require exit 0.
5. Count `Attempted import error` and `import.meta` warnings, compare with the previous 30/5 baseline, and verify referenced exports exist.
6. Commit only necessary SaaS dependency or API-drift changes with Conventional Commits.

### Task 10: Land, push, and leave deployment untouched

**Steps:**
1. Re-run statuses, public-boundary guards, `git diff --check`, full tests, build, type checks, MCP tests, and the SaaS build against the final branch tip.
2. Commit the R2 integration with the upstream range, preserved assets, retired assets, and exact verification results.
3. Switch to `main` and immediately run `git pull --ff-only`.
4. Merge `merge/upstream-2026-09-01-r2` with `--no-ff` and no merge strategy overrides.
5. Re-run final Aedifex build, type checks, MCP tests, and SaaS build.
6. Push Aedifex `main` to `origin`, then `github`; never push `upstream`.
7. Push SaaS `main` to `origin` only if necessary SaaS changes were committed.
8. Do not deploy Cloudflare or any production environment.
