/**
 * Tests for deleteLevelWithFallbackSelection (and the private
 * getAdjacentLevelIdForDeletion helper it delegates to).
 *
 * External dependencies mocked:
 *   - @aedifex/core   → useScene
 *   - @aedifex/viewer → useViewer (default export)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Minimal node factories
// ---------------------------------------------------------------------------
type NodeType = 'building' | 'level' | 'wall'

interface MockNode {
  id: string
  type: NodeType
  parentId: string | null
  children: string[]
}

function makeBuilding(id: string, children: string[]): MockNode {
  return { id, type: 'building', parentId: null, children }
}

function makeLevel(id: string, parentId: string): MockNode {
  return { id, type: 'level', parentId, children: [] }
}

// ---------------------------------------------------------------------------
// Mutable state shared between the mock factories and the tests
// ---------------------------------------------------------------------------
const sceneState: {
  nodes: Record<string, MockNode>
  deleteNode: ReturnType<typeof vi.fn>
} = {
  nodes: {},
  deleteNode: vi.fn(),
}

const viewerState: {
  selection: { levelId: string | null }
  setSelection: ReturnType<typeof vi.fn>
} = {
  selection: { levelId: null },
  setSelection: vi.fn(),
}

// ---------------------------------------------------------------------------
// Module mocks — must be declared before the module under test is imported
// ---------------------------------------------------------------------------
vi.mock('@aedifex/core', () => ({
  useScene: {
    getState: () => sceneState,
  },
}))

vi.mock('@aedifex/viewer', () => ({
  useViewer: {
    getState: () => viewerState,
  },
}))

// Import AFTER mocks are registered
const { deleteLevelWithFallbackSelection } = await import('../level-selection')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function setupScene(nodes: MockNode[]) {
  sceneState.nodes = Object.fromEntries(nodes.map((n) => [n.id, n]))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('getAdjacentLevelIdForDeletion (via deleteLevelWithFallbackSelection)', () => {
  beforeEach(() => {
    sceneState.deleteNode.mockReset()
    viewerState.setSelection.mockReset()
    viewerState.selection = { levelId: null }
    sceneState.nodes = {}
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns the previous sibling level when one exists', () => {
    const building = makeBuilding('building_1', ['level_1', 'level_2', 'level_3'])
    const level1 = makeLevel('level_1', 'building_1')
    const level2 = makeLevel('level_2', 'building_1')
    const level3 = makeLevel('level_3', 'building_1')
    setupScene([building, level1, level2, level3])

    // When level_3 is deleted, level_2 (previous) should be adjacent
    viewerState.selection = { levelId: 'level_3' }
    deleteLevelWithFallbackSelection('level_3')

    expect(viewerState.setSelection).toHaveBeenCalledWith({ levelId: 'level_2' })
  })

  it('returns the next sibling level when there is no previous sibling', () => {
    const building = makeBuilding('building_1', ['level_1', 'level_2'])
    const level1 = makeLevel('level_1', 'building_1')
    const level2 = makeLevel('level_2', 'building_1')
    setupScene([building, level1, level2])

    // level_1 is the first child — next (level_2) should be selected
    viewerState.selection = { levelId: 'level_1' }
    deleteLevelWithFallbackSelection('level_1')

    expect(viewerState.setSelection).toHaveBeenCalledWith({ levelId: 'level_2' })
  })

  it('passes null when it is the only level in the building', () => {
    const building = makeBuilding('building_1', ['level_1'])
    const level1 = makeLevel('level_1', 'building_1')
    setupScene([building, level1])

    viewerState.selection = { levelId: 'level_1' }
    deleteLevelWithFallbackSelection('level_1')

    expect(viewerState.setSelection).toHaveBeenCalledWith({ levelId: null })
  })
})

describe('deleteLevelWithFallbackSelection', () => {
  beforeEach(() => {
    sceneState.deleteNode.mockReset()
    viewerState.setSelection.mockReset()
    viewerState.selection = { levelId: null }
    sceneState.nodes = {}
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('always calls deleteNode on the given levelId', () => {
    const building = makeBuilding('building_1', ['level_1', 'level_2'])
    setupScene([building, makeLevel('level_1', 'building_1'), makeLevel('level_2', 'building_1')])

    viewerState.selection = { levelId: 'level_2' }
    deleteLevelWithFallbackSelection('level_1')

    expect(sceneState.deleteNode).toHaveBeenCalledWith('level_1')
  })

  it('calls setSelection with adjacent level when the deleted level was selected', () => {
    const building = makeBuilding('building_1', ['level_1', 'level_2', 'level_3'])
    setupScene([
      building,
      makeLevel('level_1', 'building_1'),
      makeLevel('level_2', 'building_1'),
      makeLevel('level_3', 'building_1'),
    ])

    // level_2 is currently selected; we delete it → should fall back to level_1 (previous)
    viewerState.selection = { levelId: 'level_2' }
    deleteLevelWithFallbackSelection('level_2')

    expect(viewerState.setSelection).toHaveBeenCalledWith({ levelId: 'level_1' })
  })

  it('does not call setSelection when a different level is currently selected', () => {
    const building = makeBuilding('building_1', ['level_1', 'level_2'])
    setupScene([building, makeLevel('level_1', 'building_1'), makeLevel('level_2', 'building_1')])

    // level_2 is selected; we delete level_1 → selection should not change
    viewerState.selection = { levelId: 'level_2' }
    deleteLevelWithFallbackSelection('level_1')

    expect(viewerState.setSelection).not.toHaveBeenCalled()
  })

  it('calls setSelection with null when deleting the only level that is selected', () => {
    const building = makeBuilding('building_1', ['level_only'])
    setupScene([building, makeLevel('level_only', 'building_1')])

    viewerState.selection = { levelId: 'level_only' }
    deleteLevelWithFallbackSelection('level_only')

    expect(viewerState.setSelection).toHaveBeenCalledWith({ levelId: null })
  })

  it('prefers the previous sibling over the next when both exist', () => {
    const building = makeBuilding('building_1', ['level_1', 'level_2', 'level_3'])
    setupScene([
      building,
      makeLevel('level_1', 'building_1'),
      makeLevel('level_2', 'building_1'),
      makeLevel('level_3', 'building_1'),
    ])

    // Deleting level_2 (index 1): previous is level_1, next is level_3 → prefer level_1
    viewerState.selection = { levelId: 'level_2' }
    deleteLevelWithFallbackSelection('level_2')

    expect(viewerState.setSelection).toHaveBeenCalledWith({ levelId: 'level_1' })
  })

  it('falls back to next level when deleting the first level', () => {
    const building = makeBuilding('building_1', ['level_1', 'level_2', 'level_3'])
    setupScene([
      building,
      makeLevel('level_1', 'building_1'),
      makeLevel('level_2', 'building_1'),
      makeLevel('level_3', 'building_1'),
    ])

    viewerState.selection = { levelId: 'level_1' }
    deleteLevelWithFallbackSelection('level_1')

    expect(viewerState.setSelection).toHaveBeenCalledWith({ levelId: 'level_2' })
  })
})
