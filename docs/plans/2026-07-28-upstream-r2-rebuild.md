# Upstream R2 Rebuild Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild Aedifex on `upstream/main@ab76686b` while preserving the intentional fork features and reducing future upstream-sync conflicts.

**Architecture:** Keep upstream as the base and replay only fork-unique, non-merge commits in topological order. Resolve every conflict by comparing the old fork result, the upstream replacement, and the compatibility contract; never select one side in bulk. Keep AI, MCP, branding, host adapters, and plugin integration behind existing package and registry boundaries, and retain the customized Nature plugin in-repo until an Aedifex-owned external repository and release target exist.

**Tech Stack:** Bun, TypeScript 6, React 19, Three.js 0.185, Turborepo, Vitest/Bun test runner, pnpm/Next.js for SaaS integration.

---

### Task 1: Establish the rebuild branch and replay inventory

**Files:**
- Create: `docs/plans/2026-07-28-upstream-r2-rebuild.md`

**Steps:**
1. Verify both repositories are clean and have no merge, rebase, or cherry-pick state.
2. Create `merge/upstream-2026-07-28-r2` directly from `upstream/main` without changing `main`.
3. Pull `upstream/main` immediately after switching branches.
4. Record the source fork tip `e177f4f9` and upstream base `ab76686b`.
5. Generate the replay list with:
   `git rev-list --reverse --topo-order --no-merges upstream/main..main`.
6. Exclude only commits that are proven empty because their behavior is already upstream, or a commit immediately reverted by a later fork commit.
7. Commit this plan as `docs(sync): plan upstream R2 rebuild`.

### Task 2: Replay foundational branding and package boundaries

**Files:**
- Modify: root/package manifests and package manifests under `apps/` and `packages/`
- Modify: `README.md`, `README.zh-CN.md`, `LICENSE`, `DESIGN.md`
- Modify: `apps/editor/`
- Modify: `packages/{core,viewer,editor,nodes,mcp,ifc-converter}/`

**Steps:**
1. Replay the initial branding, legal, environment, package-name, TypeScript-config, and CI-policy commits in their original topological order.
2. Preserve `@aedifex/*` names and `@repo/typescript-config`.
3. Preserve the legal Pascal attribution required by the MIT license.
4. Preserve compatibility identifiers listed in `AGENTS.md`; undo any historic fork commit that renamed a protected identifier without migration.
5. Keep upstream architecture documentation unless a document is demonstrably obsolete for the rebuilt tree.
6. Rebuild `bun.lock` with `bun install` rather than resolving lockfile conflict markers.
7. Run `bun run check-types` and fix only errors introduced by this replay batch.
8. Commit any consolidated conflict-resolution fixes separately from the original cherry-picked commits.

### Task 3: Replay AI, host integration, and editor UX

**Files:**
- Modify/Create: `apps/editor/app/api/ai/`
- Modify/Create: `packages/editor/src/components/ai/`
- Modify: `packages/editor/src/components/editor/`
- Modify: `packages/editor/src/components/ui/`
- Modify: `packages/core/src/`

**Steps:**
1. Replay the AI runtime, API routes, neutral host contracts, catalog resolver, asset upload hooks, and editor UX commits in topological order.
2. Adapt AI scene assumptions to upstream's vertical building model and stored level heights.
3. Preserve the required registry `deletable` contract and plugin-manifest validation.
4. Preserve window-blur interaction cancellation using upstream's current interaction APIs.
5. Run focused core/editor tests after each conflict-heavy group.

### Task 4: Replay MCP and security hardening

**Files:**
- Modify: `packages/mcp/`
- Modify: MCP-facing types in `packages/core/`

**Steps:**
1. Replay MCP transport, storage, scene lifecycle, live-sync, template, and tool commits.
2. Preserve loopback-only CORS defaults, safe-fetch controls, token headers, MCP server name, and existing data-directory compatibility.
3. Adapt scene operations and templates to upstream's current vertical-model and plugin-node semantics.
4. Run `bun --filter @aedifex/mcp test` and resolve all failures before proceeding.

### Task 5: Preserve roof, paint-slot, and Nature plugin extensions

**Files:**
- Modify: roof/material files under `packages/{core,nodes,viewer,editor}/`
- Restore/Modify: `packages/plugin-trees/`
- Modify: `apps/editor/package.json`

**Steps:**
1. Replay roof accessory, paint-slot, MEP, cache, and validation commits.
2. Retain upstream Three.js 0.185 and current material-registry APIs.
3. Restore the customized `packages/plugin-trees` implementation for this rebuild.
4. Remove the direct `github:pascalorg/plugin-trees` dependency from the Aedifex app and use the local `@aedifex/plugin-trees` package.
5. Keep Nature plugin registration behind the upstream plugin registry and host-panel extension points.
6. Do not create an external repository or publish a package until an Aedifex-owned target is explicitly provided.

### Task 6: Audit replay completeness and branding

**Files:**
- Inspect: `packages/`, `apps/`, `bin/`, `tooling/`, `tests/`, `examples/`, `docs/`

**Steps:**
1. Compare the rebuilt branch against both `upstream/main` and old fork tip `e177f4f9`.
2. Confirm every fork-only functional asset is either present, superseded by upstream, or documented as intentionally retired.
3. Search all required paths for Pascal package names and brand strings.
4. Preserve only the legal, historical, storage, HTTP, MCP, and userData compatibility identifiers listed in `AGENTS.md`.
5. Check the public repository diff for secrets, internal domains, `.env` files, and commercial-only code.

### Task 7: Run the Aedifex verification gate

**Steps:**
1. Run `bun install`.
2. Run `bun run build`; require every task to pass.
3. Run `bun run check-types`; require zero errors.
4. Run `bun --filter @aedifex/mcp test`; require zero failures.
5. Run focused tests for every conflict-resolved subsystem.
6. Record exact pass counts and warning notes in the final integration commit.

### Task 8: Verify the SaaS file-link integration

**Files:**
- Modify only if required: `/Users/tangshiying/hxkj/aedifex-saas/`

**Steps:**
1. Reconfirm the SaaS repository is clean.
2. Remove only the linked `node_modules/@aedifex/{core,editor,viewer,mcp}` directories.
3. Run `pnpm install --force`.
4. Run `pnpm --filter @aedifex-saas/web run build`.
5. Count known namespace-import warnings and distinguish them from real type/API failures.
6. Commit only necessary dependency-lock or API-drift changes; revert no unrelated user work.

### Task 9: Land and push

**Steps:**
1. Re-run status and all required verification commands immediately before landing.
2. Commit the R2 integration with a message describing the dynamic range, preserved fork assets, retired assets, and verification results.
3. Switch to `main` and immediately run `git pull --ff-only`.
4. Merge `merge/upstream-2026-07-28-r2` into `main` with `--no-ff`.
5. Re-run the necessary final verification.
6. Push Aedifex `main` to `origin`, then `github`; never push `upstream`.
7. Push SaaS `main` to `origin` only if necessary SaaS changes were committed.
8. Do not deploy.
