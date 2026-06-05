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

async function mkTmpRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'pascal-sqlite-concur-'))
}

async function rmrf(p: string): Promise<void> {
  await fs.rm(p, { recursive: true, force: true })
}

describe('SqliteSceneStore project placeholder lifecycle', () => {
  let rootDir: string
  let store: SqliteSceneStore

  beforeEach(async () => {
    rootDir = await mkTmpRoot()
    store = new SqliteSceneStore({ databasePath: path.join(rootDir, 'aedifex.db') })
  })

  afterEach(async () => {
    store.close()
    await rmrf(rootDir)
  })

  test('createProject returns a placeholder status with version 0 and isEmpty=true', async () => {
    const status = await store.createProject({ id: 'placeholder-1', name: 'Placeholder One' })
    expect(status.id).toBe('placeholder-1')
    expect(status.projectId).toBe('placeholder-1')
    expect(status.name).toBe('Placeholder One')
    expect(status.version).toBe(0)
    expect(status.isEmpty).toBe(true)
    expect(status.publishedVersion).toBeNull()
    expect(status.latestVersion).toBeNull()
    expect(status.browserVisibleVersion).toBeNull()
    expect(status.nodeCount).toBe(0)
    expect(status.sizeBytes).toBe(0)
    expect(status.graphHash).toBeNull()
    expect(status.editorUrl).toBe('/editor/placeholder-1')
  })

  test('getProjectStatus returns null for an id that was never created', async () => {
    const status = await store.getProjectStatus('does-not-exist')
    expect(status).toBeNull()
  })

  test('getProjectStatus returns the placeholder before any save', async () => {
    await store.createProject({ id: 'pending-save', name: 'Pending' })
    const status = await store.getProjectStatus('pending-save')
    expect(status).not.toBeNull()
    expect(status!.version).toBe(0)
    expect(status!.isEmpty).toBe(true)
    expect(status!.publishedVersion).toBeNull()
  })

  test('save() promotes a placeholder to a real row and getProjectStatus reflects it', async () => {
    await store.createProject({ id: 'promote-me', name: 'Promote Me', ownerId: 'user-1' })

    // Placeholder shows version 0.
    const before = await store.getProjectStatus('promote-me')
    expect(before!.version).toBe(0)
    expect(before!.publishedVersion).toBeNull()

    const meta = await store.save({ id: 'promote-me', name: 'Promote Me', graph: makeGraph() })
    expect(meta.id).toBe('promote-me')
    expect(meta.version).toBe(1)
    // Inherited ownerId from the placeholder when save() did not specify one.
    expect(meta.ownerId).toBe('user-1')
    // projectId defaults to the scene id when promoted from a placeholder.
    expect(meta.projectId).toBe('promote-me')

    const after = await store.getProjectStatus('promote-me')
    expect(after).not.toBeNull()
    expect(after!.version).toBe(1)
    expect(after!.publishedVersion).toBe(1)
    expect(after!.latestVersion).toBe(1)
    expect(after!.browserVisibleVersion).toBe(1)
    expect(after!.isEmpty).toBe(false)
    expect(after!.nodeCount).toBe(1)
  })

  test('placeholder createdAt is preserved when promoted via save()', async () => {
    const placeholder = await store.createProject({ id: 'keep-created', name: 'Keep' })
    await new Promise((resolve) => setTimeout(resolve, 5))
    const meta = await store.save({ id: 'keep-created', name: 'Keep', graph: makeGraph() })
    expect(meta.createdAt).toBe(placeholder.createdAt)
  })

  test('createProject rejects an id that already has a saved scene row', async () => {
    await store.save({ id: 'taken', name: 'Taken', graph: makeGraph() })
    await expect(store.createProject({ id: 'taken', name: 'Conflict' })).rejects.toThrow(
      SceneInvalidError,
    )
  })

  test('createProject sanitizes explicit ids the same way save() does', async () => {
    const status = await store.createProject({ id: '../My Project!', name: 'Sanitized' })
    expect(status.id).toBe('my-project')
    expect(await store.getProjectStatus('my-project')).not.toBeNull()
  })

  test('createProject rejects empty/whitespace-only names', async () => {
    await expect(store.createProject({ name: '' })).rejects.toThrow(SceneInvalidError)
    await expect(store.createProject({ name: '   ' })).rejects.toThrow(SceneInvalidError)
  })
})

describe('SqliteSceneStore concurrent writes', () => {
  let rootDir: string

  beforeEach(async () => {
    rootDir = await mkTmpRoot()
  })

  afterEach(async () => {
    await rmrf(rootDir)
  })

  test('sequential save() calls on one store handle commit successfully', async () => {
    // Baseline: sequential writes through the same connection work fine.
    const store = new SqliteSceneStore({ databasePath: path.join(rootDir, 'aedifex.db') })
    try {
      const a = await store.save({ id: 'seq-a', name: 'A', graph: makeGraph() })
      const b = await store.save({ id: 'seq-b', name: 'B', graph: makeGraph() })
      expect(a.id).toBe('seq-a')
      expect(b.id).toBe('seq-b')
      expect(a.version).toBe(1)
      expect(b.version).toBe(1)
    } finally {
      store.close()
    }
  })

  test('BUG: concurrent save() on one store handle fails with SQLITE_BUSY (no JS-level serialization)', async () => {
    // CURRENT BEHAVIOR: withWriteTransaction does `db.exec('BEGIN IMMEDIATE')`
    // without any in-process mutex around the single shared connection. When two
    // saves race via Promise.all, both await database() (resolves immediately),
    // then both call BEGIN IMMEDIATE on the SAME connection — SQLite rejects
    // the second with SQLITE_BUSY because nested transactions on one connection
    // are not allowed. busy_timeout=5000 does NOT help here (it covers
    // cross-connection contention, not same-connection nesting).
    //
    // EXPECTED FIX: serialize withWriteTransaction with a Promise-chain mutex
    // so concurrent save() calls queue rather than throw. Until then this test
    // pins the buggy behavior to prevent silent regressions.
    const store = new SqliteSceneStore({ databasePath: path.join(rootDir, 'aedifex.db') })
    try {
      const results = await Promise.allSettled([
        store.save({ id: 'concur-a', name: 'A', graph: makeGraph() }),
        store.save({ id: 'concur-b', name: 'B', graph: makeGraph() }),
      ])
      const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]
      // At least one of the concurrent saves must fail synchronously on the
      // nested BEGIN IMMEDIATE.
      expect(rejected.length).toBeGreaterThan(0)
      const err = rejected[0]!.reason as { code?: string; message?: string; name?: string }
      // Bun's sqlite surfaces this as SQLiteError with code SQLITE_BUSY OR
      // the BEGIN-on-active-transaction case where SQLite reports "cannot start
      // a transaction within a transaction". Either signals the same root
      // cause: no JS-level mutex around BEGIN IMMEDIATE on a shared connection.
      const msg = err.message ?? ''
      const matches =
        err.code === 'SQLITE_BUSY' ||
        /database is locked/i.test(msg) ||
        /transaction within a transaction/i.test(msg) ||
        err.name === 'SQLiteError'
      expect(matches).toBe(true)
    } finally {
      store.close()
    }
  })

  test('expectedVersion mismatch is detected on the second sequential save', async () => {
    // Demonstrates optimistic locking works for sequential ordered writes
    // (the realistic case once concurrent calls are properly serialized).
    const store = new SqliteSceneStore({ databasePath: path.join(rootDir, 'aedifex.db') })
    try {
      await store.save({ id: 'race', name: 'Seed', graph: makeGraph() })
      await store.save({ id: 'race', name: 'A', graph: makeGraph(), expectedVersion: 1 })
      // After the first overwrite, version is 2. A second attempt with
      // expectedVersion=1 must throw SceneVersionConflictError.
      await expect(
        store.save({ id: 'race', name: 'B', graph: makeGraph(), expectedVersion: 1 }),
      ).rejects.toMatchObject({ name: 'SceneVersionConflictError' })

      const final = await store.load('race')
      expect(final!.version).toBe(2)
    } finally {
      store.close()
    }
  })

  test('BUG: two separate store handles serialized sequentially work; concurrent times out', async () => {
    // CURRENT BEHAVIOR (sequential, works): writes from two different store
    // handles on the same db file work as long as each transaction commits
    // before the other begins.
    const dbPath = path.join(rootDir, 'aedifex.db')
    const a = new SqliteSceneStore({ databasePath: dbPath })
    const b = new SqliteSceneStore({ databasePath: dbPath })
    try {
      const resA = await a.save({ id: 'multi-a', name: 'A', graph: makeGraph() })
      const resB = await b.save({ id: 'multi-b', name: 'B', graph: makeGraph() })
      expect(resA.id).toBe('multi-a')
      expect(resB.id).toBe('multi-b')
      // Both rows visible from either handle (WAL mode).
      expect(await a.load('multi-b')).not.toBeNull()
      expect(await b.load('multi-a')).not.toBeNull()
    } finally {
      a.close()
      b.close()
    }
    // NOTE: a truly concurrent test on two handles still triggers SQLITE_BUSY
    // because busy_timeout=5000 does not appear to retry BEGIN IMMEDIATE in
    // Bun's sqlite driver. See bug note above for the fix recommendation.
  })
})
