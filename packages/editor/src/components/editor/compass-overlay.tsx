'use client'

import { useEffect, useRef, useState } from 'react'
import { getCameraAzimuth } from './compass-hud'

/**
 * Compass Overlay — 视口右上角的方向指示器（Canvas 外部渲染）
 *
 * 坐标系映射（与 AI prompt 一致）：
 *   +X = 东 (E)    -X = 西 (W)
 *   +Z = 南 (S)    -Z = 北 (N)
 */
export function CompassOverlay() {
  const [rotation, setRotation] = useState(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    function tick() {
      const azimuth = getCameraAzimuth()
      setRotation((azimuth * 180) / Math.PI)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return (
    <div
      className="pointer-events-none absolute top-4 right-4 z-20"
      style={{ width: 64, height: 64 }}
    >
      {/* 外圈 */}
      <div
        className="absolute inset-0 rounded-full border border-white/15"
        style={{
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(8px)',
        }}
      />

      {/* 旋转层 */}
      <div
        className="absolute inset-0"
        style={{
          transform: `rotate(${-rotation}deg)`,
          transition: 'transform 0.1s ease-out',
        }}
      >
        {/* N 标签（红色） */}
        <span
          className="absolute top-1 left-1/2 -translate-x-1/2 font-bold text-red-500"
          style={{ fontSize: 11, fontFamily: 'system-ui, sans-serif', lineHeight: 1 }}
        >
          N
        </span>

        {/* S 标签 */}
        <span
          className="absolute bottom-1 left-1/2 -translate-x-1/2 font-semibold text-white/45"
          style={{ fontSize: 10, fontFamily: 'system-ui, sans-serif', lineHeight: 1 }}
        >
          S
        </span>

        {/* E 标签 */}
        <span
          className="absolute top-1/2 right-1 -translate-y-1/2 font-semibold text-white/45"
          style={{ fontSize: 10, fontFamily: 'system-ui, sans-serif', lineHeight: 1 }}
        >
          E
        </span>

        {/* W 标签 */}
        <span
          className="absolute top-1/2 left-1.5 -translate-y-1/2 font-semibold text-white/45"
          style={{ fontSize: 10, fontFamily: 'system-ui, sans-serif', lineHeight: 1 }}
        >
          W
        </span>

        {/* 指北针（红色三角） */}
        <div
          className="absolute top-3.5 left-1/2 -translate-x-1/2"
          style={{
            width: 0,
            height: 0,
            borderLeft: '3.5px solid transparent',
            borderRight: '3.5px solid transparent',
            borderBottom: '10px solid #ef4444',
          }}
        />

        {/* 指南针底部（灰色三角） */}
        <div
          className="absolute bottom-3.5 left-1/2 -translate-x-1/2"
          style={{
            width: 0,
            height: 0,
            borderLeft: '3.5px solid transparent',
            borderRight: '3.5px solid transparent',
            borderTop: '10px solid rgba(255,255,255,0.2)',
          }}
        />

        {/* 中心圆点 */}
        <div
          className="absolute top-1/2 left-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/50"
        />
      </div>
    </div>
  )
}
