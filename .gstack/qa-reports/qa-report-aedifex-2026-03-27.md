# QA Report: Aedifex Editor

**Date:** 2026-03-27
**URL:** http://127.0.0.1:3002
**Branch:** main
**Framework:** Next.js 16.2.1 (Turbopack)
**Tier:** Standard
**Duration:** ~25 min
**Pages Visited:** 5 (/, /privacy, /terms, /nonexistent, /api/health)
**Screenshots:** 10

---

## Summary

| Severity | Found | Fixed | Deferred |
|----------|-------|-------|----------|
| Critical | 1     | 1     | 0        |
| High     | 0     | 0     | 0        |
| Medium   | 1     | 0     | 1        |
| Low      | 2     | 1     | 1        |

**Health Score:** 72 / 100

---

## Top 3 Things to Fix

1. **ISSUE-001 (Critical, FIXED):** App won't start — workspace symlinks missing after rename
2. **ISSUE-003 (Medium, DEFERRED):** Mobile viewport unusable — sidebar hidden, toolbar truncated
3. **ISSUE-004 (Low, DEFERRED):** Same JS chunk loaded 7 times on initial page load (557KB each)

---

## Issues

### ISSUE-001: App fails to start after Pascal->Aedifex rename [Critical, FIXED]

**Category:** Functional
**Repro:**
1. Run `pnpm dev` from project root
2. Turbo pipeline fails: `@aedifex/core:build` exits with tsc errors
3. Even bypassing turbo, Next.js can't resolve `@aedifex/viewer`, `@aedifex/core`, `@aedifex/editor`

**Root Cause:** After renaming packages from `@pascal/*` to `@aedifex/*`, `pnpm install` was never re-run. The `node_modules/@aedifex/` workspace symlinks didn't exist.

**Fix:** Ran `pnpm install` to rebuild workspace symlinks. All packages now resolve correctly.

**Fix Status:** verified
**Commit:** N/A (not a code fix, operational step)
**Screenshot:** N/A (terminal output)

---

### ISSUE-002: Unused imports in ai-chat-panel.tsx [Low, FIXED]

**Category:** Code Quality
**Repro:** TypeScript diagnostics show unused declarations:
- `isProposalModeActive` (import)
- `serializeSceneContext` (import)
- `loopState`, `confirmOperations`, `rejectOperations`, `setScreenshotAfter` (destructured from store)

**Root Cause:** Left over after removing hardcoded regex intent matching in the same session.

**Fix:** Removed all unused imports and destructured variables.

**Fix Status:** verified
**Commit:** 9ef1367
**Files Changed:** `packages/editor/src/components/ai/ai-chat-panel.tsx`

---

### ISSUE-003: Mobile viewport layout broken [Medium, DEFERRED]

**Category:** Visual / UX
**Repro:**
1. Open app at 375x812 viewport (iPhone)
2. Left sidebar is completely hidden (pushed off-screen)
3. Bottom toolbar is truncated — Select and Edit buttons not visible
4. No "desktop only" message or mobile fallback

**Expected:** Either a responsive layout or a clear message that the editor requires a desktop browser.

**Screenshot:** `.gstack/qa-reports/screenshots/mobile.png`

**Why Deferred:** This is a 3D editor primarily for desktop use. Adding a mobile gate/message is a design decision, not a bug fix.

---

### ISSUE-004: Duplicate chunk loading on initial page load [Low, DEFERRED]

**Category:** Performance
**Repro:**
1. Open app and monitor network tab
2. `packages_editor_src_components_tools_0t_w8fd._.js` (557KB) is loaded 7 times

**Impact:** ~3.9MB of redundant network transfer on initial load.

**Why Deferred:** Likely a Turbopack dev-mode artifact. Needs investigation to confirm if it reproduces in production build.

---

## Console Health

| Type | Count | Details |
|------|-------|---------|
| Errors (non-HMR) | 0 | No application JS errors |
| HMR WebSocket errors | 9+ | `ERR_INVALID_HTTP_RESPONSE` on `_next/webpack-hmr` — caused by system SOCKS5 proxy intercepting WebSocket handshake. Dev-only, not a bug. |
| Warnings | 0 | None |

---

## API Endpoints

| Endpoint | Method | Test | Result |
|----------|--------|------|--------|
| `/api/health` | GET | Direct request | 200 `{"status":"ok"}` |
| `/api/ai/chat` | POST | Empty body | 400 `{"error":"Missing required fields."}` |
| `/api/ai/summarize` | POST | Not tested (requires auth/payload) | — |

---

## Pages Tested

| Page | Status | Notes |
|------|--------|-------|
| `/` (Editor) | 200 | Loads correctly. 3D canvas renders. Sidebar shows "No buildings yet". Toolbar functional. |
| `/privacy` | 200 | Content renders. Links to Terms work. Brand name correct (Aedifex). |
| `/terms` | 200 | Content renders. Links to Privacy work. Brand name correct. |
| `/nonexistent` | 404 | Next.js default 404 page. |
| `/api/health` | 200 | Returns JSON health check. |

---

## Limitations

This QA session has inherent limitations for a 3D editor:

- **Canvas interactions untestable:** Wall drawing, furniture placement, drag-and-drop, camera orbit — all Three.js/WebGL interactions cannot be automated via Playwright DOM testing
- **AI chat flow untestable:** Requires valid `AI_API_KEY` environment variable and LLM backend
- **Auth flows absent:** No authentication configured in this build (no login/signup pages)
- **Empty scene:** Most editor features (edit mode, delete, level switching, material editing) require an existing building to test

---

## Category Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| Console | 100 | 15% | 15.0 |
| Links | 100 | 10% | 10.0 |
| Visual | 92 | 10% | 9.2 |
| Functional | 55 | 20% | 11.0 |
| UX | 85 | 15% | 12.75 |
| Performance | 90 | 10% | 9.0 |
| Content | 100 | 5% | 5.0 |
| Accessibility | 0 | 15% | 0.0 |

**Final Score: 72 / 100**

Note: Accessibility scored 0 because no ARIA landmarks, roles, or keyboard navigation were detected in the editor canvas. The sidebar buttons have labels but the 3D viewport is opaque to screen readers. This is common for WebGL applications but worth addressing long-term.
