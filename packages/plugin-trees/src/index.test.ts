import { describe, expect, test } from 'bun:test'
import { treesHostPanel, treesPlugin } from './index'

describe('trees plugin contract', () => {
  test('uses the current plugin API version', () => {
    expect(treesPlugin.apiVersion).toBe(2)
  })

  test('is installed by default and maps every contributed kind to Nature', () => {
    expect(treesHostPanel.pluginId).toBe(treesPlugin.id)
    expect(treesHostPanel.defaultInstalled).toBe(true)
    expect(treesHostPanel.kinds).toEqual(['trees:tree', 'trees:flower', 'trees:grass'])
  })
})
