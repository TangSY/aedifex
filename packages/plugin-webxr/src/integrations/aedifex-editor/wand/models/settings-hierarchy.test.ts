import { test } from 'bun:test'
import assert from 'node:assert/strict'
import { resolveSettingsHierarchy, type SettingsHierarchyNode } from './settings-hierarchy'

const roof = { id: 'roof', type: 'roof', parentId: 'level', children: ['segment', 'missing'] }
const segment = { id: 'segment', type: 'roof-segment', parentId: 'roof' }
const chimney = { id: 'chimney', type: 'chimney', parentId: 'level', roofSegmentId: 'segment' }
const table = { id: 'table', type: 'item', parentId: 'level', children: ['vase'] }
const vase = { id: 'vase', type: 'item', parentId: 'table' }
const nodes: Record<string, SettingsHierarchyNode> = Object.fromEntries([
  roof, segment, chimney, table, vase, { id: 'level', type: 'level' },
].map(node => [node.id, node]))

test('roof lists its segment and ignores deleted child references', () => {
  assert.deepEqual(resolveSettingsHierarchy(roof, nodes).children.map(node => node.id), ['segment'])
})
test('segment finds hosted objects whose structural parent is elsewhere', () => {
  const result = resolveSettingsHierarchy(segment, nodes)
  assert.equal(result.parent?.id, roof.id)
  assert.deepEqual(result.children.map(node => node.id), ['chimney'])
  assert.equal(resolveSettingsHierarchy(chimney, nodes).parent?.id, segment.id)
})
test('items on top of another item are listed once with a return path', () => {
  assert.deepEqual(resolveSettingsHierarchy(table, nodes).children.map(node => node.id), ['vase'])
  assert.equal(resolveSettingsHierarchy(vase, nodes).parent?.id, table.id)
})
test('does not offer navigation into level containers or deleted hosts', () => {
  assert.equal(resolveSettingsHierarchy(table, nodes).parent, undefined)
  assert.equal(resolveSettingsHierarchy({ ...vase, parentId: 'deleted' }, nodes).parent, undefined)
})

test('gutter and dormer relationships take precedence over structural parents', () => {
  const gutter = { id: 'gutter', type: 'gutter', roofSegmentId: 'segment' }
  const downspout = { id: 'pipe', type: 'downspout', gutterId: 'gutter', parentId: 'segment' }
  const dormer = { id: 'dormer', type: 'dormer', roofSegmentId: 'segment' }
  const window = { id: 'window', type: 'window', dormerId: 'dormer', parentId: 'level' }
  const all = { ...nodes, gutter, pipe: downspout, dormer, window }
  assert.equal(resolveSettingsHierarchy(downspout, all).parent?.id, 'gutter')
  assert.deepEqual(resolveSettingsHierarchy(gutter, all).children.map(node => node.id), ['pipe'])
  assert.deepEqual(resolveSettingsHierarchy(dormer, all).children.map(node => node.id), ['window'])
})
