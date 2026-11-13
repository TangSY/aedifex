import { expect, test } from 'bun:test'
import { type AnyNode, DoorNode, LevelNode, useScene, WallNode, WindowNode } from '@aedifex/core'
import { copySelectedNodesToEditorClipboard, pasteEditorClipboardToLevel } from './scene-clipboard'

test('pasting a sloped wall slides a fitting opening without losing its host', () => {
  const source = LevelNode.parse({ id: 'level_slope-source', children: ['wall_slope-source'] })
  const target = LevelNode.parse({ id: 'level_slope-target' })
  const wall = WallNode.parse({
    id: 'wall_slope-source',
    parentId: source.id,
    children: ['door_slope-source'],
    start: [0, 0],
    end: [4, 0],
    height: 1.5,
    endHeightOffset: 2,
  })
  const door = DoorNode.parse({
    id: 'door_slope-source',
    parentId: wall.id,
    wallId: wall.id,
    position: [1, 1.25, 0],
    width: 1,
    height: 2.5,
  })
  useScene.setState({
    nodes: Object.fromEntries([source, target, wall, door].map((n) => [n.id, n])) as Record<
      string,
      AnyNode
    >,
    rootNodeIds: [source.id, target.id],
    materials: {},
    collections: {},
    dirtyNodes: new Set(),
  } as never)
  expect(copySelectedNodesToEditorClipboard([wall.id])).toBe(true)
  const result = pasteEditorClipboardToLevel(target.id)!
  const pastedWall = useScene.getState().nodes[result.pastedIds[0]!] as WallNode
  const pastedDoor = useScene.getState().nodes[pastedWall.children[0]!] as DoorNode
  expect(pastedDoor.wallId).toBe(pastedWall.id)
  expect(pastedDoor.position[0]).toBeCloseTo(2.5)
  expect(result.unadjustedOpeningIds).toEqual([])
})

test('pasting an existing opening that fits nowhere retains its stored position', () => {
  const source = LevelNode.parse({ id: 'level_slope-source', children: ['wall_slope-source'] })
  const target = LevelNode.parse({ id: 'level_slope-target' })
  const wall = WallNode.parse({
    id: 'wall_slope-source',
    parentId: source.id,
    children: ['window_slope-source'],
    start: [0, 0],
    end: [4, 0],
    height: 0.5,
    endHeightOffset: 0.5,
  })
  const window = WindowNode.parse({
    id: 'window_slope-source',
    parentId: wall.id,
    wallId: wall.id,
    position: [2, 1.5, 0],
    width: 1,
    height: 2,
  })
  useScene.setState({
    nodes: Object.fromEntries([source, target, wall, window].map((n) => [n.id, n])) as Record<
      string,
      AnyNode
    >,
    rootNodeIds: [source.id, target.id],
    materials: {},
    collections: {},
    dirtyNodes: new Set(),
  } as never)
  expect(copySelectedNodesToEditorClipboard([wall.id])).toBe(true)
  const result = pasteEditorClipboardToLevel(target.id)!
  const pastedWall = useScene.getState().nodes[result.pastedIds[0]!] as WallNode
  const pastedWindow = useScene.getState().nodes[pastedWall.children[0]!] as WindowNode
  expect(pastedWindow.position).toEqual(window.position)
  expect(result.unadjustedOpeningIds).toEqual([pastedWindow.id])
})
