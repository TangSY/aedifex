import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { type AnyNode, nodeRegistry, type AnyNodeDefinition } from '@aedifex/core'
import { z } from 'zod'
import { nodeDisplayLabel } from './node-display-label'

let restoreRegistry = () => {}

beforeEach(() => {
  restoreRegistry = nodeRegistry._snapshot()
  nodeRegistry._register({
    kind: 'ticket-booth', schemaVersion: 1, category: 'utility',
    schema: z.object({ id: z.string(), type: z.literal('ticket-booth'), name: z.string().optional() }),
    defaults: () => ({ id: 'ticket-booth_a', type: 'ticket-booth' }),
    capabilities: { deletable: true },
    renderer: { kind: 'parametric', module: async () => ({ default: () => null }) },
    presentation: { label: 'Admissions kiosk', icon: { kind: 'url', src: '/kiosk.svg' } },
  } as AnyNodeDefinition)
})

afterEach(() => restoreRegistry())

describe('registered node display labels', () => {
  test('uses an external plugin presentation label without adding an editor kind branch', () => {
    const node = { id: 'ticket-booth_a', type: 'ticket-booth' } as unknown as AnyNode
    expect(nodeDisplayLabel(node)).toBe('Admissions kiosk')
    expect(nodeDisplayLabel({ ...node, name: 'North entrance' })).toBe('North entrance')
  })

  test('keeps item catalog names and explicit instance names', () => {
    const item = { type: 'item', asset: { name: 'Reading chair' } } as AnyNode
    expect(nodeDisplayLabel(item)).toBe('Reading chair')
    expect(nodeDisplayLabel({ ...item, name: 'Chair by the window' })).toBe('Chair by the window')
  })

  test('makes unregistered kinds readable without maintaining a builtin label table', () => {
    expect(nodeDisplayLabel({ type: 'wall' } as AnyNode)).toBe('Wall')
    expect(nodeDisplayLabel({ type: 'external-counter' } as unknown as AnyNode)).toBe('External counter')
  })
})
