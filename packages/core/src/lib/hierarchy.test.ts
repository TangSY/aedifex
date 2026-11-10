import { expect, test } from 'bun:test'
import type { AnyNodeId } from '../schema/types'
import { hierarchyCycleErrors, wouldCreateHierarchyCycle } from './hierarchy'

test('checks new parent chains without being trapped by an existing cycle', () => {
  const nodes = { site_a: { parentId: 'site_b' }, site_b: { parentId: 'site_a' } }
  expect(
    wouldCreateHierarchyCycle({
      nodeId: 'site_new' as AnyNodeId,
      parentId: 'site_a' as AnyNodeId,
      nodes,
    }),
  ).toBe(false)
  expect(
    wouldCreateHierarchyCycle({
      nodeId: 'site_a' as AnyNodeId,
      parentId: 'site_b' as AnyNodeId,
      nodes,
    }),
  ).toBe(true)
  expect(hierarchyCycleErrors(nodes).map((error) => error.nodeId)).toEqual(['site_a', 'site_b'])
})
