import { expect, test } from 'bun:test'
import { type RoofEvent, RoofNode, RoofSegmentNode, sceneRegistry, useScene } from '@aedifex/core'
import { Object3D } from 'three'
import { createRelativeRoofDrag } from './relative-roof-drag'

test('an existing accessory keeps its position at drag start and when changing segments', () => {
  const first = RoofSegmentNode.parse({
    id: 'rseg_drag_old_a',
    roofType: 'gambrel',
    width: 10,
    depth: 8,
    wallHeight: 0,
    pitch: 45,
  })
  const second = RoofSegmentNode.parse({
    id: 'rseg_drag_old_b',
    roofType: 'hip',
    width: 10,
    depth: 6,
    wallHeight: 0,
    pitch: 45,
  })
  const roof = RoofNode.parse({ id: 'roof_drag_old', children: [first.id, second.id] })
  const oldNodes = useScene.getState().nodes
  const previousFirst = sceneRegistry.nodes.get(first.id)
  const previousSecond = sceneRegistry.nodes.get(second.id)
  const firstObject = new Object3D()
  const secondObject = new Object3D()
  secondObject.position.x = 20
  sceneRegistry.nodes.set(first.id, firstObject)
  sceneRegistry.nodes.set(second.id, secondObject)
  useScene.setState({ nodes: { ...oldNodes, [first.id]: first, [second.id]: second } })
  const event = (x: number, y: number, z: number) =>
    ({ node: roof, position: [x, y, z] }) as RoofEvent
  try {
    const oldPosition: [number, number, number] = [0, 0.8333333333, 3]
    const drag = createRelativeRoofDrag({ position: oldPosition, roofSegmentId: first.id })
    const start = drag.resolve(event(0, 1, 3))!
    expect([start.localX, start.localY, start.localZ]).toEqual(oldPosition)
    const moved = drag.resolve(event(0, 2, 2))!
    expect(moved.localY).toBeCloseTo(oldPosition[1] + 1)
    const transferred = drag.resolve(event(20, 3, 0))!
    expect(transferred.segment.id).toBe(second.id)
    expect(transferred.localY).toBeCloseTo(moved.localY)
  } finally {
    useScene.setState({ nodes: oldNodes })
    if (previousFirst) sceneRegistry.nodes.set(first.id, previousFirst)
    else sceneRegistry.nodes.delete(first.id)
    if (previousSecond) sceneRegistry.nodes.set(second.id, previousSecond)
    else sceneRegistry.nodes.delete(second.id)
  }
})
