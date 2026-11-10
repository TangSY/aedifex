import { expect, test } from 'bun:test'
import type { AnyNode } from '../schema'
import { authoredSceneChanges } from './authored-scene-merge'

const source = (params: Record<string, number>, artifact: string) => ({
  kind: 'script',
  language: 'three',
  script: 'a'.repeat(64),
  params,
  artifact: artifact.repeat(64),
  manifest: { build: artifact },
  inputs: artifact,
})
const node = (script: ReturnType<typeof source>) =>
  ({ id: 'zone_test', type: 'zone', parentId: null, floor: { script } }) as unknown as AnyNode
const changes = (base: AnyNode, current: AnyNode, next: AnyNode) =>
  authoredSceneChanges({ zone_test: current }, { zone_test: base }, { zone_test: next })

test('a design parameter change carries its own compile after an automatic rebuild', () => {
  const base = node(source({ grain: 1 }, 'b'))
  const current = node(source({ grain: 1 }, 'c'))
  const next = node(source({ grain: 2 }, 'd'))
  expect(changes(base, current, next).update?.[0]?.data).toEqual({ floor: (next as any).floor })
})

test('manual script edits are retained or refused rather than combined with another compile', () => {
  const base = node(source({ grain: 1 }, 'b'))
  const current = node(source({ grain: 2 }, 'c'))
  const rebuilt = node(source({ grain: 1 }, 'd'))
  expect(changes(base, current, rebuilt).update).toEqual([])
  const next = node(source({ grain: 3 }, 'e'))
  expect(() => changes(base, current, next)).toThrow(
    'Both the design and the current scene changed',
  )
})

test('a rebuild alone does not prevent removal but a parameter edit does', () => {
  const base = node(source({ grain: 1 }, 'b'))
  const rebuilt = node(source({ grain: 1 }, 'c'))
  expect(authoredSceneChanges({ zone_test: rebuilt }, { zone_test: base }, {}).delete).toEqual([
    'zone_test',
  ])
  const edited = node(source({ grain: 2 }, 'c'))
  expect(() => authoredSceneChanges({ zone_test: edited }, { zone_test: base }, {})).toThrow(
    'edited after conversion',
  )
})
