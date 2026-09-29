import { describe, expect, test } from 'bun:test'
import { resolveRegisteredTreeNodeComponent } from './tree-node-resolution'

describe('resolveRegisteredTreeNodeComponent', () => {
  const fallback = 'registry-tree-node'
  const components = { wall: 'wall-tree-node' }
  const registered = new Set(['wall', 'construction-dimension', 'structural-grid'])

  test('keeps a dedicated component when one exists', () => {
    expect(
      resolveRegisteredTreeNodeComponent({
        nodeType: 'wall',
        components,
        isRegistered: (nodeType) => registered.has(nodeType),
        fallback,
      }),
    ).toBe('wall-tree-node')
  })

  test.each(['construction-dimension', 'structural-grid'])(
    'uses the registry row for registered kind %s',
    (nodeType) => {
      expect(
        resolveRegisteredTreeNodeComponent({
          nodeType,
          components,
          isRegistered: (kind) => registered.has(kind),
          fallback,
        }),
      ).toBe(fallback)
    },
  )

  test('keeps unknown, unregistered kinds hidden', () => {
    expect(
      resolveRegisteredTreeNodeComponent({
        nodeType: 'unknown',
        components,
        isRegistered: (nodeType) => registered.has(nodeType),
        fallback,
      }),
    ).toBeUndefined()
  })
})
