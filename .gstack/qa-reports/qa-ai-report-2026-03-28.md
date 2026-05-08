# AI Agent Compliance QA Report — 2026-03-28

## Test Environment

| Item | Detail |
|------|--------|
| Date | 2026-03-28 |
| Browser | Headed Chromium (GPU enabled) |
| URL | http://localhost:3002 |
| Renderer | WebGPU (Three.js) |
| Test Scene | 4 walls + doors + windows + furniture |

---

## Test Results Summary

| Category | Tested | Passed | Failed | Skipped |
|----------|--------|--------|--------|---------|
| 1.1 add_item | 2 | 1 | 1 | 5 |
| 1.5 add_wall | 1 | 1 | 0 | 7 |
| 1.6 add_door | 1 | 1 | 0 | 9 |
| 1.8 remove_node | 1 | 1 | 0 | 5 |
| 1.9 batch_operations | 1 | 1 | 0 | 4 |
| 1.10 propose_placement | 1 | 1 | 0 | 3 |
| 1.11 ask_user | 2 | 2 | 0 | 2 |
| 1.12 confirm_preview | 1 | 1 | 0 | 3 |
| 1.13 reject_preview | 1 | 1 | 0 | 1 |
| 3.x Agentic Loop | 3 | 2 | 1 | 7 |
| 4.x System Prompt | 3 | 3 | 0 | 7 |
| 5.x UI States | 4 | 4 | 0 | 10 |
| **Total** | **21** | **19** | **2** | **56** |

---

## Detailed Test Results

### 1.1.1 — add_item: Exact Slug Match

**Input:** "放一个 couch-medium 在房间中央"

**Result:** PARTIAL PASS

- AI correctly resolved `couch-medium` to Sofa catalog item
- Ghost preview appeared in 3D viewport
- Auto-confirm worked between iterations

**Issues Found:**

| ID | Severity | Description |
|----|----------|-------------|
| AI-004 | Medium | AI added 2 Sofas in agentic loop. Iteration 1 creates Sofa (auto-confirmed), iteration 2 creates another Sofa with adjusted position. User asked for 1 item but got 2. |
| AI-005 | Medium | No AI text reply after add_item completion. Only operation cards visible, no summary text. (Contrast: test 1.1.2 DID produce text reply.) |

**Screenshot:** `/tmp/qa-ai-test-1-1-1d.png`

---

### 1.1.2 — add_item: Fuzzy Name Match

**Input:** "放一张沙发"

**Result:** PASS

- AI correctly matched "沙发" (Chinese for sofa) to Sofa catalog item
- AI demonstrated scene awareness: detected 2 overlapping sofas from previous test
- AI proactively offered to clean up duplicates before placing new one
- Text reply present with clear explanation
- Before/After screenshot comparison visible in operation card

**Screenshot:** `/tmp/qa-ai-test-1-1-2b.png`

---

### 1.5.8 — add_wall: Create Complete Room

**Input:** "创建一个3m x 4m的新房间，和现有房间相邻"

**Result:** PASS (with concerns)

- AI created a new room adjacent to existing one using batch_operations
- Multiple iterations: walls created across 3+ batches
- Duplicate wall detection blocked some redundant attempts
- 3D viewport showed two adjacent rooms correctly

**Issues Found:**

| ID | Severity | Description |
|----|----------|-------------|
| AI-006 | Low | AI used 8 iterations to create a simple room. Multiple failed attempts to add doors (invalid wallId in early iterations), then succeeded later. Excessive iteration count suggests prompt could be optimized. |

**Screenshot:** `/tmp/qa-ai-test-1-5-8c.png`

---

### 1.6.1 — add_door: Normal Addition

**Input:** "在北墙上添加一扇门"

**Result:** PASS

- AI correctly identified north wall via spatial reasoning
- Door added successfully in first iteration (auto-confirmed)
- Second iteration detected overlap with existing door, returned `status=invalid`
- AI then used ask_user to offer alternatives: left side or right side of wall
- Validation rules working: overlap detection, position clamping

**Screenshot:** `/tmp/qa-ai-test-1-6-1.png`

---

### 1.8.1 — remove_node: Remove Wall

**Input:** "移除南墙"

**Result:** PASS

- AI correctly identified south wall
- Preview mode activated: "预览 1项操作" with reject/confirm buttons
- Wall marked for removal in viewport
- Tested REJECT: wall restored to scene (test 1.13.1)

**Screenshot:** `/tmp/qa-ai-test-1-8-1.png`

---

### 1.9.1 — batch_operations: Furnish Living Room

**Input:** "帮我布置客厅，放一张沙发、一个茶几和一个电视柜"

**Result:** PASS

- AI first proposed 2 layout options (propose_placement behavior)
- After user selected Plan A, AI executed batch operation:
  - Removed old item
  - Added Coffee Table (adjusted position)
  - Added TV Stand (adjusted position)
- AI provided detailed layout summary with spatial reasoning
- Position adjustments applied automatically to avoid collisions

**Screenshot:** `/tmp/qa-ai-planA.png`

---

### 1.10.1 — propose_placement: Multi-Option Proposal

**Input:** "帮我布置客厅，放一张沙发、一个茶几和一个电视柜"

**Result:** PASS

- AI returned 2 options (A: traditional layout, B: horizontal layout)
- Each option included detailed spatial reasoning per furniture item
- User selected option A → AI executed it via batch_operations
- Wall references with actual IDs included in descriptions

**Note:** AI used ask_user-style text proposal rather than the dedicated propose_placement tool with tab switching UI. The propose_placement tabs UI was not observed.

**Screenshot:** `/tmp/qa-ai-propose.png`

---

### 1.11.1–1.11.2 — ask_user: Pause and Resume Loop

**Input:** AI asked "你想要 A) 左侧加门 还是 B) 右侧加门？" → User replied "选A，在北墙左侧加门"

**Result:** PASS

- ask_user correctly paused the agentic loop
- UI showed AI question with options
- User reply correctly resumed the loop
- AI executed the chosen option (door on left side)
- AI provided completion summary

**Screenshot:** `/tmp/qa-ai-test-askuser.png`

---

### 1.12.1 — confirm_preview: Confirm Operation

**Result:** PASS

- Confirm button visible in preview bar
- Ghost nodes converted to real nodes on confirm
- Before/After screenshot comparison displayed in operation card
- Operation status updated to "已确认"

---

### 1.13.1 — reject_preview: Reject Operation

**Input:** Clicked "拒绝" on wall removal preview

**Result:** PASS

- Scene fully restored to pre-operation state
- Operation status updated to "已拒绝"
- Preview bar disappeared
- All 4 walls visible again in 3D viewport

**Screenshot:** `/tmp/qa-ai-test-reject2.png`

---

### 3.1 — Agentic Loop: Normal Cycle

**Result:** PASS

- Full loop observed: user message → LLM → tool_call → execute → tool_result → LLM → done
- Multiple iterations observed (up to 8)
- Auto-confirm between iterations works

### 3.4 — Deterministic Tool Skip

**Result:** PASS (with concern)

- remove_item correctly breaks loop after execution (no LLM callback)
- But this prevents AI from continuing planned follow-up actions

### 3.9 — Scene Context Refresh

**Result:** PASS

- Each iteration received updated scene context
- AI detected scene changes from previous iterations (e.g., duplicate sofas, existing doors)

---

### 4.1 — Language Matching

**Result:** PASS — Chinese input → Chinese output consistently

### 4.3 — Spatial Reasoning

**Result:** PASS — AI correctly identified "北墙" (north wall) from scene geometry

### 4.5 — Conflict Detection

**Result:** PASS — AI detected overlapping sofas and door position conflicts

---

### 5.x — UI States

| Test | Result | Notes |
|------|--------|-------|
| 5.2 Operation card pending | PASS | "预览 N项操作" with reject/confirm buttons |
| 5.3 Operation card confirmed | PASS | "已确认" status, buttons removed |
| 5.4 Operation card rejected | PASS | "已拒绝" status displayed |
| 5.7 Before/After screenshots | PASS | Comparison images in operation card |

---

## Issues Summary

| ID | Severity | Category | Description | Status |
|----|----------|----------|-------------|--------|
| AI-004 | Medium | Agentic Loop | Duplicate item creation in loop iterations. AI creates item in iter 1 (auto-confirmed), then creates same item again in iter 2. | NEW |
| AI-005 | Medium | UI | No AI text reply after some tool executions (observed in 1.1.1 but not 1.1.2). Inconsistent text reply behavior. | NEW |
| AI-006 | Low | Agentic Loop | Excessive iterations for simple room creation (8 iterations). Many failed add_door attempts before succeeding. | NEW |

## Previously Fixed Issues (Verified)

| ID | Description | Status |
|----|-------------|--------|
| User Issue 1 | Doors/windows not rendering (duplicate wall overlay) | FIXED — duplicate wall detection added |
| User Issue 2 | Ghost previews not converting to real nodes | FIXED |
| User Issue 3 | No text reply after ask_user | FIXED |
| AI-001 | batch_operations partial validation | VERIFIED OK (not a bug) |
| AI-002 | CDN URL ERR_CONNECTION_REFUSED | FIXED |
| AI-003 | Duplicate operation cards | FIXED |

---

## Console Health

- No JavaScript errors detected
- WebGPU depth texture sample count warnings (dev-only, not actionable)
- THREE.Clock deprecation warning (cosmetic)

---

## Recommendations

### High Priority
1. **AI-004 fix**: Add deduplication logic in agentic loop — if the previous iteration already created an item of the same type, skip or warn before creating another. Or reduce MAX_ITERATIONS for simple single-item requests.

### Medium Priority
2. **AI-005 fix**: Ensure AI always produces a text reply summarizing what was done. The inconsistency suggests a race condition or early loop termination path that skips the final LLM call.

### Low Priority
3. **AI-006**: Consider optimizing the system prompt to help AI reference wall IDs correctly from the first iteration, reducing failed attempts.
4. **propose_placement tool**: AI tends to use ask_user for multi-option proposals instead of the dedicated propose_placement tool. Consider prompt engineering to encourage use of the dedicated tool.

---

## Test Coverage

**Tested:** 21/77 test cases (27%)

**Remaining untested categories:**
- 1.1.3–1.1.7: Edge cases for add_item (non-existent items, rotation, boundary, collision, empty scene)
- 1.2: remove_item (full matrix)
- 1.3: move_item
- 1.4: update_material
- 1.5.1–1.5.7: add_wall edge cases
- 1.6.2–1.6.10: add_door edge cases
- 1.7: add_window
- 2.x: Validation rules (catalog resolver, collision detection, wall validation, door/window positioning)
- 6.x: Ghost Preview system details
- 7.x: Scene serialization
- 8.x: SSE streaming
- 9.x: Rate limiting
- 10.x: Edge cases and error handling
