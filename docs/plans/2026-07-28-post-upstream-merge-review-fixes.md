# Post-Upstream Merge Review Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Repair every confirmed regression from the 2026-07-28 upstream merge review without restoring obsolete architecture or changing deployment state.

**Architecture:** Restore fork-owned plugin and IFC safety contracts, make registry consumers default-safe for future node kinds, and serialize SQLite writes at the store boundary. Treat removed public APIs as a SemVer correction rather than reintroducing deleted systems, and preserve the fork decision that GitHub Actions remain disabled.

**Tech Stack:** TypeScript 6, Bun, Turborepo, React 19, Zod 4, Bun SQLite, pnpm, Next.js 16.

---

### Task 1: Restore plugin v2 and Nature installation metadata

**Files:**
- Modify: `packages/core/src/registry/types.ts`
- Modify: `packages/core/src/registry/registry.ts`
- Modify: `packages/core/src/registry/registry.test.ts`
- Modify: `packages/nodes/src/index.ts`
- Modify: `packages/nodes/src/index.test.ts`
- Modify: `packages/plugin-trees/src/index.ts`
- Modify: `packages/plugin-trees/src/index.test.ts`
- Modify: `wiki/architecture/plugin-authoring.md`

**Steps:**
1. Add failing tests that reject legacy v1 manifests and require Nature to be a default-installed plugin panel.
2. Run the focused registry and plugin tests and confirm the failures.
3. Restore `HOST_API_VERSION` and the `Plugin` manifest type to v2.
4. Set built-in and Nature manifests to v2; add Nature `pluginId`, `kinds`, and `defaultInstalled`.
5. Update plugin-authoring documentation to describe v2 and project installation.
6. Rerun focused tests and confirm they pass.

### Task 2: Restore IFC placement-cycle protection

**Files:**
- Modify: `packages/ifc-converter/src/index.ts`
- Create or modify: `packages/ifc-converter/src/index.test.ts`

**Steps:**
1. Add a bounded fake-IFC regression test for a cyclic `PlacementRelTo` chain.
2. Run it against the current code and confirm it fails without hanging.
3. Restore a visited-placement guard that retains the best-effort accumulated transform.
4. Rerun the converter tests and confirm they pass.

### Task 3: Make node consumers and deletion capability exhaustive

**Files:**
- Modify: `packages/editor/src/components/ui/sidebar/panels/site-panel/tree-node.tsx`
- Create or modify: `packages/editor/src/components/ui/sidebar/panels/site-panel/tree-node.test.tsx`
- Modify: `packages/core/src/registry/types.ts`
- Modify: built-in `packages/nodes/src/**/definition.ts` files only where TypeScript proves an explicit `deletable` value is missing

**Steps:**
1. Add tests showing registered construction dimensions and structural grids resolve to the generic registry tree row.
2. Make registered node kinds fall back to `RegistryTreeNode`; keep truly unknown kinds hidden.
3. Restore `Capabilities.deletable` as required.
4. Run type checking, add explicit values only to definitions that fail the contract, and rerun focused tests.

### Task 4: Correct breaking package versions and preserve fork CI policy

**Files:**
- Modify: affected `packages/*/package.json` dependency ranges and versions
- Modify: `CHANGELOG.md` or the repository's current release-note source
- Delete: `.github/workflows/ci.yml`
- Delete: `.github/workflows/mcp-ci.yml`
- Regenerate: `bun.lock`

**Steps:**
1. Confirm which packages removed public exports in `e177f4f9..HEAD`.
2. Bump only those packages to the next breaking `0.x` version and synchronize internal peer/dev dependency ranges.
3. Document removed exports and replacements; do not restore obsolete systems or compatibility shims.
4. Remove the two workflows in accordance with commits `5eddd30b` and `c7b5a525`.
5. Run `bun install` to regenerate the lockfile and verify package metadata.

### Task 5: Serialize SQLite writes and restore concurrency coverage

**Files:**
- Modify: `packages/mcp/src/storage/sqlite-scene-store.ts`
- Restore and update: `packages/mcp/src/storage/sqlite-scene-store.concurrency.test.ts`

**Steps:**
1. Restore concurrency tests that expect same-store writes to queue and optimistic locking to remain deterministic.
2. Run the focused test and confirm current concurrent writes fail.
3. Add a rejection-safe promise queue around `withWriteTransaction`.
4. Add multi-handle coverage if the store lifecycle supports deterministic in-process serialization.
5. Rerun focused storage tests and confirm all writes commit or return the intended version conflict.

### Task 6: Full verification

**Files:**
- Verify all modified files and generated lockfile.

**Steps:**
1. Run focused plugin, IFC, tree, registry, and SQLite tests.
2. Run `bun install`, `bun run build`, `bun run check-types`, and `bun --filter @aedifex/mcp test`.
3. Run relevant core, nodes, editor, plugin-trees, and IFC package tests.
4. Rebuild `aedifex-saas` with the repository-prescribed file-link workflow and record warning counts.
5. Run `git diff --check`, inspect the complete diff, and confirm both repositories contain no unrelated changes.
