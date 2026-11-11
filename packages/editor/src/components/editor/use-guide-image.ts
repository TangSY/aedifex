import { useAssetImageUrl } from '@aedifex/viewer'
import { useEffect, useMemo, useState } from 'react'

export type GuideImageDimensions = { width: number; height: number }

export function useResolvedAssetUrl(url: string): string | null {
  return useAssetImageUrl(url).url
}

export function useGuideImageDimensions(url: string | null): GuideImageDimensions | null {
  const generation = useMemo(() => ({ url }), [url])
  const [result, setResult] = useState<{
    generation: object
    dimensions: GuideImageDimensions
  } | null>(null)

  useEffect(() => {
    if (!url) return
    let cancelled = false
    const image = new globalThis.Image()
    image.onload = () => {
      if (cancelled) return
      const width = image.naturalWidth || image.width
      const height = image.naturalHeight || image.height
      setResult(width > 0 && height > 0 ? { generation, dimensions: { width, height } } : null)
    }
    image.onerror = () => {
      if (!cancelled) setResult(null)
    }
    image.src = url
    return () => {
      cancelled = true
      image.onload = null
      image.onerror = null
      image.removeAttribute('src')
    }
  }, [url, generation])

  return url && result?.generation === generation ? result.dimensions : null
}
