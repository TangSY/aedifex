import { test } from 'bun:test'
import assert from 'node:assert/strict'
import { BuildingNode, ElevatorNode, GutterNode, LevelNode, RoofSegmentNode, useScene } from '@aedifex/core'
import { linkedSettingsRows } from './linked-settings'
import type { NestedSettingsAPI } from './nested-settings'

test('elevator access lists only its service levels and edits independent access flags', () => {
  const building = BuildingNode.parse({})
  const a = LevelNode.parse({ parentId: building.id, level: 0 })
  const b = LevelNode.parse({ parentId: building.id, level: 1 })
  const outside = LevelNode.parse({ level: 2 })
  building.children = [a.id, b.id]
  let node = ElevatorNode.parse({ parentId: building.id, fromLevelId: a.id, toLevelId: b.id })
  const api: NestedSettingsAPI = { read: () => node, update: patch => { node = { ...node, ...patch } }, nodes: { [building.id]: building, [a.id]: a, [b.id]: b, [outside.id]: outside }, materials: [], select: () => {}, create: () => {}, remove: () => {} }
  const rows = linkedSettingsRows(node, api)
  assert.equal(rows.length, 2)
  const row = rows.find(row => row.id === `linked-level-${b.id}`)
  assert.ok(row?.kind === 'cycle')
  row.next()
  assert.deepEqual(node.serviceOnlyLevelIds, [b.id])
  assert.deepEqual(node.disabledLevelIds, [])
})

test('roof trim normalizes against footprint and preserves other metadata', () => {
  let node = RoofSegmentNode.parse({ width: 2, depth: 2, metadata: { custom: true } })
  const api: NestedSettingsAPI = { read: () => node, update: patch => { node = { ...node, ...patch } }, nodes: {}, materials: [], select: () => {}, create: () => {}, remove: () => {} }
  const row = linkedSettingsRows(node, api).find(row => row.id === 'linked-trim-left')
  assert.ok(row?.kind === 'stepper')
  row.onChange(100)
  assert.ok(node.trim.left <= 1.9)
  const gutters = linkedSettingsRows(node, api).find(row => row.id === 'linked-gutters')
  assert.ok(gutters?.kind === 'choice')
  gutters.onSelect?.()
  assert.equal((node.metadata as Record<string, unknown>).custom, true)
})

test('adding a downspout creates the matching outlet and host reference', () => {
  const previous = useScene.getState().nodes
  const segment = RoofSegmentNode.parse({})
  const gutter = GutterNode.parse({ roofSegmentId: segment.id, parentId: segment.id })
  useScene.setState({ nodes: { [segment.id]: segment, [gutter.id]: gutter } })
  try {
    const api: NestedSettingsAPI = { read: () => useScene.getState().nodes[gutter.id], update: () => {}, nodes: useScene.getState().nodes, materials: [], select: () => {}, create: () => {}, remove: () => {} }
    const row = linkedSettingsRows(gutter, api).find(row => row.id === 'linked-downspout-add')
    assert.ok(row?.kind === 'action')
    row.onSelect?.()
    const state = useScene.getState()
    const pipe = Object.values(state.nodes).find(node => node.type === 'downspout')
    assert.ok(pipe?.type === 'downspout')
    assert.equal(pipe.gutterId, gutter.id)
    const updated = state.nodes[gutter.id]
    assert.ok(updated?.type === 'gutter')
    assert.equal(updated.outlets[0]?.id, pipe.outletId)
  } finally { useScene.setState({ nodes: previous }) }
})
