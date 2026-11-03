import { describe, expect, test } from 'bun:test'
import { type ArtifactStore, putArtifacts } from './artifact-store'

const entries = [
  { sha256: 'geometry', bytes: new Uint8Array([1]), mimeType: 'model/gltf-binary' },
  { sha256: 'script', bytes: new Uint8Array([2]), mimeType: 'text/javascript' },
]

function store(put: ArtifactStore['put']): ArtifactStore {
  return { put, text: async () => null, url: () => null }
}

describe('related artifact writes', () => {
  test('uses the host batch capability once and retains result ordering', async () => {
    const received: unknown[] = []
    const host = { ...store(async () => { throw Error('unexpected individual put') }),
      putBatch: async (batch: typeof entries) => { received.push(batch); return ['stored-geometry', 'stored-script'] } }
    expect(await putArtifacts({ store: host, entries })).toEqual(['stored-geometry', 'stored-script'])
    expect(received).toEqual([entries])
  })
  test('keeps legacy hosts working and propagates failed writes', async () => {
    const host = store(async (hash) => { if (hash === 'script') throw Error('failed'); return hash })
    await expect(putArtifacts({ store: host, entries })).rejects.toThrow('failed')
    expect(await putArtifacts({ store: store(async hash => hash), entries })).toEqual(['geometry', 'script'])
  })
  test('rejects incomplete host batch responses', async () => {
    const host = { ...store(async hash => hash), putBatch: async () => ['geometry'] }
    await expect(putArtifacts({ store: host, entries })).rejects.toThrow('invalid batch result')
  })
})
