'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'

/**
 * 相机方位角同步器（R3F 内部组件）
 *
 * 每 3 帧将相机 azimuth 写入模块级变量，
 * 供 Canvas 外部的 CompassOverlay 读取。
 */

/** 模块级共享：相机水平方位角（弧度） */
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
