import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { loadPlugin, nodeRegistry } from '../registry'
import type { AnyNodeDefinition } from '../registry/types'
import type { AnyNode, AnyNodeId } from '../schema'
import useScene from './use-scene'

const PLUGIN_ID = 'test:plugin'
const originalRequestAnimationFrame = globalThis.requestAnimationFrame
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame
let pendingFrame: FrameRequestCallback | null = null

function flushNodeUpdates() {
  const callback = pendingFrame
  pendingFrame = null
  callback?.(0)
}

async function loadPluginNode(installed = true): Promise<AnyNodeId> {
  const kind = 'test:plugin-node'
  const definition = {
    kind,
    schemaVersion: 1,
    schema: z.object({ id: z.string(), type: z.literal(kind), visible: z.boolean().default(true) }),
    category: 'utility',
    defaults: () => ({}),
    capabilities: { deletable: false },
  } as unknown as AnyNodeDefinition
  await loadPlugin({ id: PLUGIN_ID, apiVersion: 2, nodes: [definition] })
  const nodeId = 'plugin_node' as AnyNodeId
  useScene.getState().setScene(
    { [nodeId]: { id: nodeId, type: kind, visible: true } as unknown as AnyNode },
    [nodeId],
    { installedPlugins: installed ? [PLUGIN_ID] : [], hasExplicitPluginInstallState: true },
  )
  useScene.temporal.getState().clear()
  return nodeId
}

describe('scene plugin installation state', () => {
  beforeEach(() => {
    globalThis.requestAnimationFrame = (callback) => {
      pendingFrame = callback
      return 1
    }
    globalThis.cancelAnimationFrame = () => {
      pendingFrame = null
    }
    nodeRegistry._reset()
    useScene.getState().setReadOnly(false)
    useScene.getState().unloadScene()
  })

  afterEach(() => {
    try {
      flushNodeUpdates()
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame
    }
  })

  test('loads an explicit installed plugin list with the scene', () => {
    useScene.getState().setScene({}, [], {
      installedPlugins: ['aedifex:trees'],
      hasExplicitPluginInstallState: true,
    })

    expect(useScene.getState().installedPlugins).toEqual(['aedifex:trees'])
    expect(useScene.getState().hasExplicitPluginInstallState).toBe(true)
  })

  test('install changes are de-duplicated and become explicit', () => {
    useScene.getState().setInstalledPlugins(['aedifex:trees', 'aedifex:trees'], { explicit: true })

    expect(useScene.getState().installedPlugins).toEqual(['aedifex:trees'])
    expect(useScene.getState().hasExplicitPluginInstallState).toBe(true)
  })

  test('clearing geometry preserves project plugin installs', () => {
    useScene.getState().setInstalledPlugins(['aedifex:trees'], { explicit: true })
    useScene.getState().clearScene()

    expect(useScene.getState().installedPlugins).toEqual(['aedifex:trees'])
    expect(useScene.getState().hasExplicitPluginInstallState).toBe(true)
  })

  test('uninstall clears plugin build work and reinstall schedules it again', async () => {
    const nodeId = await loadPluginNode()

    expect(useScene.getState().dirtyNodes.has(nodeId)).toBe(true)

    useScene.getState().setInstalledPlugins([], { explicit: true })
    expect(useScene.getState().dirtyNodes.has(nodeId)).toBe(false)

    useScene.getState().setInstalledPlugins([PLUGIN_ID], { explicit: true })
    expect(useScene.getState().dirtyNodes.has(nodeId)).toBe(true)
  })

  test.each([true, false])(
    'dirty tracking follows plugin history with initially installed=%p',
    async (initiallyInstalled) => {
      const nodeId = await loadPluginNode(initiallyInstalled)
      useScene.getState().setInstalledPlugins(initiallyInstalled ? [] : [PLUGIN_ID])

      useScene.temporal.getState().undo()
      await Promise.resolve()
      expect(useScene.getState().installedPlugins.includes(PLUGIN_ID)).toBe(initiallyInstalled)
      useScene.getState().dirtyNodes.clear()
      useScene.getState().dirtyNodes.add(nodeId)
      expect(useScene.getState().dirtyNodes.has(nodeId)).toBe(initiallyInstalled)

      // Keep the plugin-toggle redo entry while exercising a real node edit.
      useScene.temporal.getState().pause()
      try {
        useScene.getState().dirtyNodes.clear()
        useScene.getState().updateNode(nodeId, { visible: false })
        expect(useScene.getState().nodes[nodeId]?.visible).toBe(false)
        expect(useScene.getState().dirtyNodes.has(nodeId)).toBe(initiallyInstalled)
        flushNodeUpdates()
        expect(useScene.getState().dirtyNodes.has(nodeId)).toBe(initiallyInstalled)
      } finally {
        useScene.temporal.getState().resume()
      }

      useScene.temporal.getState().redo()
      await Promise.resolve()
      expect(useScene.getState().installedPlugins.includes(PLUGIN_ID)).toBe(!initiallyInstalled)
      useScene.getState().dirtyNodes.clear()
      useScene.getState().dirtyNodes.add(nodeId)
      expect(useScene.getState().dirtyNodes.has(nodeId)).toBe(!initiallyInstalled)
      useScene.getState().dirtyNodes.clear()
      useScene.getState().updateNode(nodeId, { visible: false })
      expect(useScene.getState().dirtyNodes.has(nodeId)).toBe(!initiallyInstalled)
      flushNodeUpdates()
      expect(useScene.getState().dirtyNodes.has(nodeId)).toBe(!initiallyInstalled)
    },
  )
})
