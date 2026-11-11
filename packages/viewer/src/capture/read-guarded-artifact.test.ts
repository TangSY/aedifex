import { expect, spyOn, test } from 'bun:test'
import { readGuardedCaptureArtifact } from './read-guarded-artifact'

test('capture artifact checks both its authored and resolved source', async () => {
  const fetcher = spyOn(globalThis, 'fetch').mockImplementation(
    async () => new Response(new Uint8Array([1, 2])),
  )
  const common = {
    documentUrl: 'https://app.example/editor',
    origins: ['https://allowed.example'],
    signal: new AbortController().signal,
    maxBytes: 1024,
  }
  try {
    await expect(
      readGuardedCaptureArtifact({
        ...common,
        sourceUrl: 'https://blocked.example/capture.json',
        resolvedUrl: 'blob:https://app.example/opaque',
      }),
    ).rejects.toThrow()
    await expect(
      readGuardedCaptureArtifact({
        ...common,
        sourceUrl: '/capture.json',
        resolvedUrl: 'https://blocked.example/capture.json',
      }),
    ).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
    const bytes = await readGuardedCaptureArtifact({
      ...common,
      sourceUrl: '/capture.json',
      resolvedUrl: 'https://app.example/capture.json',
    })
    expect([...bytes]).toEqual([1, 2])
    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe('error')
  } finally {
    fetcher.mockRestore()
  }
})

test('capture model reads stop at the shared byte limit', async () => {
  const fetcher = spyOn(globalThis, 'fetch').mockImplementation(
    async () => new Response(new Uint8Array([1, 2, 3, 4])),
  )
  try {
    await expect(
      readGuardedCaptureArtifact({
        sourceUrl: 'https://allowed.example/model.ply',
        resolvedUrl: 'https://allowed.example/model.ply',
        documentUrl: 'https://app.example/editor',
        origins: ['https://allowed.example'],
        signal: new AbortController().signal,
        maxBytes: 3,
      }),
    ).rejects.toThrow('budget')
  } finally {
    fetcher.mockRestore()
  }
})
