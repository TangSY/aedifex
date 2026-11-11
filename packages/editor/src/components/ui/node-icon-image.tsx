'use client'

import { ARTIFACT_URL_PREFIX } from '@aedifex/core'
import { useAssetImageUrl } from '@aedifex/viewer'
import Image, { type ImageProps } from 'next/image'

/**
 * A node's icon or thumbnail. A scripted object's thumbnail is an
 * `artifact://` image: it resolves through the project's artifact store and
 * skips image optimization, whose server-side fetch has no session to read a
 * private project's artifact with.
 */
export function NodeIconImage({ src, ...props }: Omit<ImageProps, 'src'> & { src: string }) {
  const { url } = useAssetImageUrl(src)
  if (!url) return null
  return (
    <Image
      {...props}
      src={url}
      unoptimized={
        props.unoptimized || src.startsWith(ARTIFACT_URL_PREFIX) || url.startsWith('blob:')
      }
    />
  )
}
