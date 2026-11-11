'use client'

import type { HTMLAttributes } from 'react'
import { useAssetImageUrl } from '../hooks/use-asset-image-url'

export function AssetBackground({
  imageUrl,
  style,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { imageUrl?: string }) {
  const { url } = useAssetImageUrl(imageUrl ?? '')
  return (
    <span
      {...props}
      style={{ ...style, backgroundImage: url ? `url(${JSON.stringify(url)})` : undefined }}
    />
  )
}
