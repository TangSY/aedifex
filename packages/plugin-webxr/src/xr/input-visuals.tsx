'use client'

import { DefaultXRController, DefaultXRHand } from '@react-three/xr'
import type { ComponentProps } from 'react'

export function VisibleXRController(props: ComponentProps<typeof DefaultXRController>) {
  return <DefaultXRController {...props} />
}

export function VisibleXRHand(props: ComponentProps<typeof DefaultXRHand>) {
  return <DefaultXRHand {...props} />
}
