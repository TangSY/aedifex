# QA Report — Pascal Editor AI Feature

**Date:** 2026-03-26
**URL:** http://localhost:3002
**Branch:** main (3 commits ahead of origin)
**Mode:** Diff-aware (AI design assistant feature)
**Duration:** ~10 minutes
**Framework:** Next.js 16.2.1 (Turbopack)
**Pages visited:** 3 (homepage, AI panel, Site panel)
**Screenshots:** 6

---

## Health Score: 72/100

| Category | Weight | Score | Notes |
|----------|--------|-------|-------|
| Console | 15% | 40 | WebGPU fallback warning, post-processing init failure (headless) |
| Links | 10% | 100 | No broken links detected |
| Visual | 10% | 85 | AI panel renders correctly, minor mobile overlap |
| Functional | 20% | 80 | AI panel loads, chips work, error handling works, API routes respond correctly |
| UX | 15% | 70 | Good empty state with suggestions, error message clear |
| Performance | 10% | 90 | Page loads in ~6.7s (cold start, includes 3D init) |
| Content | 5% | 100 | Chinese localization correct |
| Accessibility | 15% | 50 | AI panel buttons lack aria-labels, sidebar icons unnamed |

---

## Top 3 Things to Fix

1. **ISSUE-001 (High):** Sidebar AI icon has no accessible label — screen readers can't identify it
2. **ISSUE-002 (Medium):** Post-processing renderer fails in environments without GPU/WebGL extensions
3. **ISSUE-003 (Low):** Mobile viewport layout breaks — sidebar and tools overlap on 375px width

---

## Issues

### ISSUE-001: AI sidebar icon has no accessible name
- **Severity:** High
- **Category:** Accessibility
- **Page:** `/` (editor homepage)
- **Evidence:** `screenshots/homepage.png` — the 3rd sidebar icon (AI Sparkles) at y=106 has no text, no aria-label, no title attribute
- **Repro:**
  1. Navigate to http://localhost:3002
  2. Inspect sidebar icon buttons (x=13, y=26/66/106)
  3. All three top sidebar icons have no accessible names — screen readers report them as "unnamed"
- **Impact:** Screen reader users cannot identify or navigate to the AI assistant panel

### ISSUE-002: Post-processing renderer initialization failure
- **Severity:** Medium
- **Category:** Console
- **Page:** `/` (editor homepage)
- **Evidence:** Console error: `[viewer] Failed to initialize renderer for post-processing. TypeError: Cannot read properties of null (reading 'getSupportedExtensions')`
- **Repro:**
  1. Navigate to http://localhost:3002
  2. Check browser console
  3. Error appears on every page load
- **Impact:** Post-processing effects (bloom, SSAO, etc.) disabled. May affect visual quality. This is a pre-existing issue related to WebGPU/WebGL2 fallback, not caused by AI changes.

### ISSUE-003: Mobile viewport layout broken
- **Severity:** Low
- **Category:** Visual
- **Page:** `/` (editor homepage, 375x812 viewport)
- **Evidence:** `screenshots/mobile-home.png` — sidebar overlaps 3D viewport, tools bar clips off-screen
- **Repro:**
  1. Navigate to http://localhost:3002 at 375x812 viewport
  2. Sidebar and tool panels overlap the 3D canvas
- **Impact:** Editor unusable on mobile. This is a known pre-existing design choice (desktop-first editor), not introduced by AI feature.

---

## AI Feature Specific Tests

### AI Panel Loading
- **Status:** PASS
- AI panel accessible via 3rd sidebar icon (Sparkles)
- Welcome message: "AI 设计助手" with description
- 4 suggestion chips displayed correctly
- Input textarea with placeholder "描述你想要的设计变更..."

### Suggestion Chip Click
- **Status:** PASS
- Clicking "在客厅放一张沙发和茶几" populates input textarea
- Text appears in the input field as expected

### Message Send (Enter key)
- **Status:** PASS
- Enter key sends the message
- User message appears as blue bubble at top of chat area
- Suggestion chips disappear after first message
- Input field clears and is ready for next message

### API Error Handling (No API Key)
- **Status:** PASS
- `/api/ai/chat` returns 503 with `{"error":"AI service not configured. AI_API_KEY is missing."}`
- `/api/ai/summarize` returns 503 with `{"error":"AI service not configured."}`
- Error message displayed in chat panel in red text
- Input field remains usable after error

### Panel Switching
- **Status:** PASS
- Switching between AI panel and Site/Structure panels works without errors
- AI chat state preserved when switching away and back

### API Input Validation
- **Status:** PASS (partial)
- Invalid JSON body returns 503 (API key check runs first, before JSON parsing — acceptable)
- Empty messages array returns 503 (same reason — acceptable)
- Note: Cannot fully test 400 validation without a valid API key configured

---

## Console Health Summary

| Error | Count | Source |
|-------|-------|--------|
| WebGPU not available, running under WebGL2 | 1 | Pre-existing (Three.js) |
| Post-processing init TypeError | 1 | Pre-existing (viewer) |
| THREE.Clock deprecated | 1 | Pre-existing (Three.js) |

All console errors are pre-existing, not introduced by the AI feature.

---

## Changes Tested: 3 pages/routes affected by this branch

| Route | Works? | Evidence |
|-------|--------|----------|
| `/` (editor with AI panel) | Yes | `screenshots/ai-after-chip-click.png`, `screenshots/ai-send-no-key.png` |
| `/api/ai/chat` | Yes (503 without key) | API returns correct error JSON |
| `/api/ai/summarize` | Yes (503 without key) | API returns correct error JSON |

---

## Notes

- Full end-to-end AI conversation testing requires a valid `AI_API_KEY` configured in `.env.local`
- Ghost preview, multi-proposal, and before/after screenshot features cannot be tested without a working AI backend
- No regressions detected on existing editor functionality (sidebar, tools, 3D viewport all load correctly)
- No test framework detected for E2E tests. Run `/qa` to bootstrap one and enable regression test generation.
