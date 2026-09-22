import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import type { SceneGraph } from '@aedifex/core/clone-scene-graph'
import { SqliteSceneStore } from './sqlite-scene-store'
import { SceneInvalidError } from './types'

function makeGraph(): SceneGraph {
  return {
    nodes: {
      site_concur1: {
        object: 'node',
        id: 'site_concur1',
        type: 'site',
        parentId: null,
        visible: true,
        metadata: {},
      },
    } as SceneGraph['nodes'],
    rootNodeIds: ['site_concur1'] as SceneGraph['rootNodeIds'],
  }
}

describe('SqliteSceneStore concurrent writes', () => {
  let rootDir: string
  let store: SqliteSceneStore

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aedifex-sqlite-concur-'))
    store = new SqliteSceneStore({ databasePath: path.join(rootDir, 'aedifex.db') })
  })

  afterEach(async () => {
    store.close()
    await fs.rm(rootDir, { recursive: true, force: true })
  })

  test('serializes concurrent saves on one store handle', async () => {
    const results = await Promise.all([
      store.save({ id: 'concur-a', name: 'A', graph: makeGraph() }),
      store.save({ id: 'concur-b', name: 'B', graph: makeGraph() }),
    ])

    expect(results.map((result) => result.id)).toEqual(['concur-a', 'concur-b'])
    expect(results.every((result) => result.version === 1)).toBe(true)
    expect(await store.load('concur-a')).not.toBeNull()
    expect(await store.load('concur-b')).not.toBeNull()
  })

  test('continues processing queued writes after a rejected write', async () => {
    const rejected = store.save({ id: 'invalid', name: '', graph: makeGraph() })
    const accepted = store.save({ id: 'after-failure', name: 'Valid', graph: makeGraph() })

    await expect(rejected).rejects.toBeInstanceOf(SceneInvalidError)
    await expect(accepted).resolves.toMatchObject({ id: 'after-failure', version: 1 })
  })

  test('preserves optimistic version conflict semantics under queued writes', async () => {
    await store.save({ id: 'race', name: 'Seed', graph: makeGraph() })

    const results = await Promise.allSettled([
      store.save({ id: 'race', name: 'A', graph: makeGraph(), expectedVersion: 1 }),
      store.save({ id: 'race', name: 'B', graph: makeGraph(), expectedVersion: 1 }),
    ])

    expect(results[0]?.status).toBe('fulfilled')
    expect(results[1]?.status).toBe('rejected')
    if (results[1]?.status === 'rejected') {
      expect(results[1].reason).toMatchObject({ name: 'SceneVersionConflictError' })
    }
    expect((await store.load('race'))?.version).toBe(2)
  })
})
