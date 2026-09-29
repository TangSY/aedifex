import { test } from 'bun:test'
import assert from 'node:assert/strict'
import type { AnyNode } from '@aedifex/core'
import { cabinetStack, nestedSettingsRows, redistributeRatios, type NestedSettingsAPI } from './nested-settings'

function harness(value: Record<string, unknown>) {
  let node = value as AnyNode
  const created: unknown[] = []
  const selected: string[] = []
  const api: NestedSettingsAPI = {
    read: () => node, update: patch => { node = { ...node, ...patch } as AnyNode },
    select: id => { selected.push(id) }, create: (...args) => { created.push(args) }, remove: () => {},
    nodes: {}, materials: [],
  }
  return {
    read: () => node as unknown as Record<string, any>, created, selected,
    row: (id: string) => {
      const row = nestedSettingsRows(node, api).find(row => row.id === `nested-${id}`)
      assert.ok(row, `Missing ${id}`)
      return row
    },
    action(id: string) { const row = this.row(id); assert.equal(row.kind, 'action'); if (row.kind === 'action') row.onSelect?.() },
    number(id: string, value: number) { const row = this.row(id); assert.equal(row.kind, 'stepper'); if (row.kind === 'stepper') row.onChange(value) },
  }
}

test('ratio edits preserve total and sibling proportions', () => {
  const result = redistributeRatios([2, 3, 5], 0, 0.4)
  assert.ok(Math.abs(result.reduce((a, b) => a + b) - 1) < 1e-10)
  assert.ok(Math.abs(result[1]! / result[2]! - 3 / 5) < 1e-10)
  assert.deepEqual(redistributeRatios([1], 0, 0.4), [1])
})

test('door edits preserve other segment fields and cannot remove the final segment', () => {
  const h = harness({ id: 'door_a', type: 'door', openingKind: 'door', doorType: 'hinged', segments: [
    { type: 'panel', heightRatio: 0.5, columnRatios: [1], dividerThickness: 0.03, panelDepth: 0.01, panelInset: 0.04 },
    { type: 'glass', heightRatio: 0.5, columnRatios: [1], dividerThickness: 0.03, panelDepth: 0.01, panelInset: 0.04 },
  ] })
  h.number('segment-0-columns-count', 3)
  h.number('segment-0-height', 70)
  assert.equal(h.read().segments[0].columnRatios.length, 3)
  assert.equal(h.read().segments[1].type, 'glass')
  h.action('segment-1-remove')
  h.action('segment-0-remove')
  assert.equal(h.read().segments.length, 1)
})

test('cabinet default is editable and materialized without losing it when adding', () => {
  const h = harness({ id: 'cabinet_a', type: 'cabinet', width: 0.6, carcassHeight: 0.8 })
  h.number('cabinet_a-default-shelves', 4)
  h.action('compartment-add')
  assert.equal(h.read().stack[0].shelfCount, 4)
  assert.equal(h.read().stack.length, 2)
  assert.equal(cabinetStack({ id: 'c', width: 0.4, stack: [] })[0]?.type, 'door')
})

test('opening deletion keeps auto-cutout metadata aligned and auto cutouts link to source', () => {
  const h = harness({ id: 'slab_a', type: 'slab', polygon: [[0, 0], [4, 0], [4, 4]], holes: [[[0, 0], [1, 0], [1, 1]], [[2, 2], [3, 2], [3, 3]]], holeMetadata: [{ source: 'manual' }, { source: 'stair', stairId: 'stair_a' }] })
  h.action('hole-0-remove')
  assert.equal(h.read().holeMetadata[0].stairId, 'stair_a')
  h.action('hole-0-host')
  assert.deepEqual(h.selected, ['stair_a'])
  h.action('hole-add')
  assert.equal(h.read().holes.length, h.read().holeMetadata.length)
})

test('removing a material slot remaps faces and preserves geometry and other slots', () => {
  const h = harness({ id: 'block_a', type: 'block', slots: { paint: 'library:red' }, slotNames: { body: 'Body', paint: 'Paint' }, topology: { vertices: [1], edges: [2], faces: [{ id: 'f', materialSlot: 'paint' }] } })
  h.action('slot-paint-remove')
  assert.equal(h.read().topology.faces[0].materialSlot, 'body')
  assert.deepEqual(h.read().topology.vertices, [1])
  assert.equal(h.read().slotNames.paint, undefined)
})

test('stair landing creates a landing rather than a flight', () => {
  const h = harness({ id: 'stair_a', type: 'stair', stairType: 'straight', children: [] })
  h.action('stair-add-true')
  assert.equal((h.created[0] as any)[1].segmentType, 'landing')
  assert.equal((h.created[0] as any)[1].stepCount, 0)
})

test('window grid edits keep rows and columns independent', () => {
  const h = harness({ id: 'window_a', type: 'window', openingKind: 'window', columnRatios: [1], rowRatios: [1], columnDividerThickness: 0.03, rowDividerThickness: 0.03 })
  h.number('columnRatios-count', 2)
  h.number('columnRatios-0', 65)
  assert.deepEqual(h.read().rowRatios, [1])
  assert.deepEqual(h.read().columnRatios, [0.65, 0.35])
})

test('cabinet reorder preserves each compartment identity and last compartment stays', () => {
  const h = harness({ id: 'cabinet_a', type: 'cabinet', width: 0.6, carcassHeight: 0.8, stack: [{ id: 'a', type: 'shelf', shelfCount: 3 }, { id: 'b', type: 'drawer', drawerCount: 2 }] })
  h.action('a-move-1')
  assert.equal(h.read().stack[1].id, 'a')
  h.action('b-remove')
  h.action('a-remove')
  assert.equal(h.read().stack.length, 1)
  assert.equal(h.read().stack[0].shelfCount, 3)
})
