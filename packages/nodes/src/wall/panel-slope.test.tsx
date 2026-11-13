import { expect, test } from 'bun:test'
import {
  getEffectiveNode,
  LevelNode,
  useLiveNodeOverrides,
  useScene,
  WallNode,
} from '@aedifex/core'
import { resolveWallOpeningCeiling } from '@aedifex/core/building'
import { createWallPropertyPreview, wallSlopeEditPatch } from './property-preview'

test('changing the offset previews and commits without changing the storey-bound start', () => {
  const scene = useScene.getState()
  const level = LevelNode.parse({ id: 'level_slope-panel', height: 3 })
  const wall = WallNode.parse({
    id: 'wall_slope-panel',
    parentId: level.id,
    start: [0, 0],
    end: [4, 0],
    endHeightOffset: -0.8,
  })
  useScene.setState({
    nodes: { [level.id]: level, [wall.id]: wall },
    dirtyNodes: new Set(),
  } as never)
  try {
    const edit = createWallPropertyPreview(wall.id)
    edit.preview({ endHeightOffset: -1.2 })
    expect((useScene.getState().nodes[wall.id] as WallNode).endHeightOffset).toBe(-0.8)
    expect(getEffectiveNode(wall).endHeightOffset).toBe(-1.2)
    edit.commit()
    const committed = useScene.getState().nodes[wall.id] as WallNode
    expect(committed.height).toBeUndefined()
    expect(committed.endHeightOffset).toBe(-1.2)
    expect(resolveWallOpeningCeiling(committed, useScene.getState().nodes, 0)).toBeCloseTo(3)
    expect(resolveWallOpeningCeiling(committed, useScene.getState().nodes, 1)).toBeCloseTo(1.8)
  } finally {
    useLiveNodeOverrides.getState().clearAll()
    useScene.setState(scene)
  }
})

test('editing a split slope retains floor following through preview and commit', () => {
  const scene = useScene.getState()
  const level = LevelNode.parse({ id: 'level_slope-edit', height: 3 })
  const wall = WallNode.parse({
    parentId: level.id,
    start: [0, 0],
    end: [4, 0],
    height: 2,
    endHeightOffset: -1,
    topProfile: { offset: -4, from: 0.25, to: 1 },
  })
  useScene.setState({
    nodes: { [level.id]: level, [wall.id]: wall },
    dirtyNodes: new Set(),
  } as never)
  try {
    const edit = createWallPropertyPreview(wall.id)
    for (const offset of [-0.5, -0.7]) {
      const current = getEffectiveNode(wall)
      edit.preview(wallSlopeEditPatch({ wall: current, nodes: useScene.getState().nodes, offset }))
    }
    const preview = getEffectiveNode(wall)
    expect(
      resolveWallOpeningCeiling(preview, useScene.getState().nodes, 1) -
        resolveWallOpeningCeiling(preview, useScene.getState().nodes, 0),
    ).toBeCloseTo(-0.7)
    edit.commit()
    const committed = useScene.getState().nodes[wall.id] as WallNode
    expect(committed.topProfile?.supportHeight).toBeUndefined()
    const nodes = { ...useScene.getState().nodes, [level.id]: { ...level, height: 5 } }
    expect(resolveWallOpeningCeiling(committed, nodes, 0)).toBeCloseTo(4)
    expect(resolveWallOpeningCeiling(committed, nodes, 1)).toBeGreaterThan(0.01)
  } finally {
    useLiveNodeOverrides.getState().clearAll()
    useScene.setState(scene)
  }
})
