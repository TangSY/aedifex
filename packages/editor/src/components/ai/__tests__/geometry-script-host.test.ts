import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configureArtifactStore, GeometryArtifactManifest, useScene } from '@aedifex/core'
import {
  compileAndStoreGeometryScript,
  configureBlenderScriptBuilder,
  getGeometryScriptCapabilities,
} from '../../../lib/geometry-script/author'

import { compileAndStoreFinishScript } from '../../../lib/geometry-script/finish-scripts'
import { useViewer } from '@aedifex/viewer'

const compile = vi.hoisted(() => vi.fn())
vi.mock('../../../lib/geometry-script/client', () => ({ compileGeometryScriptInWorker: compile }))

function compiled() {
  return {
    sha256: 'a'.repeat(64),
    script: 'b'.repeat(64),
    language: 'three' as const,
    mount: 'floor' as const,
    params: {},
    manifest: GeometryArtifactManifest.parse({
      bounds: { min: [0, 0, 0], max: [1, 1, 1] },
      triangles: 12,
    }),
  }
}

beforeEach(() => {
  configureBlenderScriptBuilder(null)
  compile.mockReset()
  compile.mockResolvedValue({ ...compiled(), glb: new ArrayBuffer(4) })
  useScene.setState({ nodes: {} })
})

afterEach(() => {
  configureArtifactStore(null)
  configureBlenderScriptBuilder(null)
})

describe('script host capabilities and project scope', () => {
  it('defaults to three and refuses bpy before executing or storing anything', async () => {
    const put = vi.fn()
    configureArtifactStore({ put, text: async () => null, url: () => null })
    expect(getGeometryScriptCapabilities().languages).toEqual(['three'])
    await expect(
      compileAndStoreGeometryScript({ code: 'import bpy', language: 'bpy' }),
    ).rejects.toThrow('cannot run Blender')
    expect(compile).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
  })

  it('stores both artifacts with metadata and keeps the host-returned geometry hash', async () => {
    const storedHash = 'c'.repeat(64)
    const put = vi.fn(async (hash: string) => (hash === compiled().sha256 ? storedHash : hash))
    configureArtifactStore({ put, text: async () => null, url: () => null })
    const built = await compileAndStoreGeometryScript({
      code: 'module',
      name: 'Cornice',
      category: 'trim',
    })
    expect(built.sha256).toBe(storedHash)
    expect(built.nodeId).toMatch(/^item_/)
    expect(put.mock.calls[0]?.[2]).toBe('model/gltf-binary')
    expect(put.mock.calls[1]?.[2]).toBe('text/javascript')
    expect(put.mock.calls[0]?.[3]).toMatchObject({
      nodeId: built.nodeId,
      metadata: { name: 'Cornice', category: 'trim', kind: 'item', mount: 'floor' },
    })
  })

  it('rejects a project switch after compilation before writing artifacts', async () => {
    const put = vi.fn()
    configureArtifactStore({ put, text: async () => null, url: () => null })
    let current = true
    compile.mockImplementation(async () => {
      current = false
      return { ...compiled(), glb: new ArrayBuffer(4) }
    })
    await expect(
      compileAndStoreGeometryScript({
        code: 'module',
        assertCurrent: () => {
          if (!current) throw new Error('Project changed')
        },
      }),
    ).rejects.toThrow('Project changed')
    expect(put).not.toHaveBeenCalled()
  })

  it('checks project scope after an explicitly registered bpy builder settles', async () => {
    let current = true
    configureBlenderScriptBuilder(async () => {
      current = false
      return { ...compiled(), language: 'bpy' }
    })
    expect(getGeometryScriptCapabilities().languages).toEqual(['three', 'bpy'])
    await expect(
      compileAndStoreGeometryScript({
        code: 'import bpy',
        language: 'bpy',
        assertCurrent: () => {
          if (!current) throw new Error('Project changed')
        },
      }),
    ).rejects.toThrow('Project changed')
  })
})

describe('finish script project scope', () => {
  it.each(['store', 'project'] as const)(
    'refuses a %s switch before storing a finish',
    async (change) => {
      const previousProject = useViewer.getState().projectId
      const put = vi.fn()
      const otherPut = vi.fn()
      configureArtifactStore({ put, text: async () => null, url: () => null })
      compile.mockImplementation(async () => {
        if (change === 'store')
          configureArtifactStore({ put: otherPut, text: async () => null, url: () => null })
        else useViewer.setState({ projectId: 'other-project' })
        return { ...compiled(), glb: new ArrayBuffer(4) }
      })
      try {
        await expect(
          compileAndStoreFinishScript({
            code: 'finish',
            nodeId: 'zone_test',
            inputs: {
              polygon: [
                [0, 0],
                [2, 0],
                [2, 2],
              ],
              holes: [],
              elevation: 0,
            },
          }),
        ).rejects.toThrow('project changed')
        expect(put).not.toHaveBeenCalled()
        expect(otherPut).not.toHaveBeenCalled()
      } finally {
        useViewer.setState({ projectId: previousProject })
      }
    },
  )
})
