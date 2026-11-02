import { afterEach, expect, test } from 'bun:test'
import { initSpaceDetectionSync } from '../../lib/space-detection'
import { BuildingNode, LevelNode, type ZoneNode } from '../../schema'
import useScene, { clearSceneHistory } from '../../store/use-scene'
import { createZone, divideZone, mergeZones, structureChangeBatch } from './index'

let stop = () => {}
afterEach(() => {
  stop()
  useScene.temporal.getState().resume()
  clearSceneHistory()
})

test('merged room intent and both conflicting originals survive one undo/redo step', () => {
  globalThis.requestAnimationFrame ??= (callback) => {
    callback(0)
    return 0
  }
  globalThis.cancelAnimationFrame ??= () => {}
  const level = LevelNode.parse({ id: 'level_merge_intent', parentId: 'building_merge_intent' })
  const building = BuildingNode.parse({ id: 'building_merge_intent', children: [level.id] })
  useScene.setState({
    nodes: { [level.id]: level, [building.id]: building },
    rootNodeIds: [building.id],
    dirtyNodes: new Set(),
    collections: {},
    materials: {},
    readOnly: false,
  })
  useScene.temporal.getState().resume()
  clearSceneHistory()
  stop = initSpaceDetectionSync(useScene, { getState: () => ({ spaces: {}, setSpaces: () => {} }) })
  let i = 0
  const mintId = (kind: string) => `${kind}_merge_intent_${++i}`
  const created = createZone(useScene.getState().nodes, {
    levelId: level.id,
    polygon: [
      [0, 0],
      [8, 0],
      [8, 4],
      [0, 4],
    ],
    enclose: true,
    mintId,
  })
  useScene.getState().applyNodeChanges(structureChangeBatch(created.changes))
  useScene.getState().updateNode(created.zoneId as ZoneNode['id'], {
    name: 'Studio',
    roomNumber: 'A101',
    seed: [1, 2],
    metadata: { daylight: { artificialLight: true }, marker: 'studio-intent' },
  })
  const division = divideZone(useScene.getState().nodes, {
    zoneId: created.zoneId,
    cut: [
      [2, 0],
      [2, 4],
    ],
    mintId,
  })
  useScene.getState().applyNodeChanges(structureChangeBatch(division.changes))
  const other = Object.values(useScene.getState().nodes).find(
    (n) => n.type === 'zone' && n.id !== created.zoneId,
  ) as ZoneNode
  useScene.getState().updateNode(other.id, {
    name: 'Kitchen',
    metadata: { daylight: { artificialLight: false }, marker: 'kitchen-intent' },
  })
  const before = useScene.getState().nodes
  clearSceneHistory()
  const plan = mergeZones(before, { zoneIds: [created.zoneId, other.id] })
  expect(plan.conflicts).toBeUndefined()
  useScene.getState().applyNodeChanges(structureChangeBatch(plan.changes))
  const after = useScene.getState().nodes
  const merged = Object.values(after).filter((n): n is ZoneNode => n.type === 'zone')
  expect(merged).toHaveLength(1)
  expect(merged[0]).toMatchObject({
    name: 'Studio',
    roomNumber: 'A101',
    metadata: { daylight: { artificialLight: true } },
  })
  expect(JSON.stringify(merged[0]!.metadata)).toContain('studio-intent')
  expect(JSON.stringify(merged[0]!.metadata)).toContain('kitchen-intent')
  expect(useScene.temporal.getState().pastStates).toHaveLength(1)
  useScene.temporal.getState().undo()
  expect(useScene.getState().nodes).toEqual(before)
  useScene.temporal.getState().redo()
  expect(useScene.getState().nodes).toEqual(after)
})
