'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'

/**
 * Camera Azimuth Synchronizer (R3F internal component)
 *
 * Writes camera azimuth to a module-level variable every 3 frames,
 * for CompassOverlay (outside Canvas) to read.
 */

/** Module-level shared: camera horizontal azimuth (radians) */
let _cameraAzimuth = 0
export function getCameraAzimuth(): number {
  return _cameraAzimuth
}

export function CameraAzimuthSync() {
  const { camera } = useThree()
  const frameCount = useRef(0)

  useFrame(() => {
    frameCount.current++
    if (frameCount.current % 3 !== 0) return
    _cameraAzimuth = Math.atan2(camera.position.x, camera.position.z)
  })

  return null
}
