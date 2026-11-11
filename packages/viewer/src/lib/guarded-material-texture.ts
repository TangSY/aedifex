import type { Texture } from 'three'
import { readGuardedAssetImage } from './read-guarded-asset-image'

export async function loadGuardedMaterialTexture({
  source,
  resolvedUrl,
  documentUrl,
  origins,
  signal,
  loadTexture,
}: {
  source: string
  resolvedUrl: string
  documentUrl: string
  origins: readonly string[]
  signal: AbortSignal
  loadTexture: (url: string) => Promise<Texture>
}): Promise<Texture> {
  const blob = await readGuardedAssetImage({
    url: source,
    cdnResolvedUrl: resolvedUrl,
    documentUrl,
    origins,
    signal,
  })
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  const objectUrl = URL.createObjectURL(blob)
  let abort!: () => void
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => reject(new DOMException('Aborted', 'AbortError'))
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
  })
  try {
    const decoding = Promise.resolve()
      .then(() => {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
        return loadTexture(objectUrl)
      })
      .then((texture) => {
        if (signal.aborted) {
          texture.dispose()
          throw new DOMException('Aborted', 'AbortError')
        }
        return texture
      })
    return await Promise.race([decoding, cancelled])
  } finally {
    signal.removeEventListener('abort', abort)
    URL.revokeObjectURL(objectUrl)
  }
}
