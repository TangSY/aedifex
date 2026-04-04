'use client'

import { useEffect, useRef, useState } from 'react'
import { getCameraAzimuth } from './compass-hud'

/**
 * Compass Overlay — direction indicator at viewport top-right (rendered outside Canvas)
 *
 * Coordinate system mapping (consistent with AI prompt):
 *   +X = East (E)    -X = West (W)
 *   +Z = South (S)   -Z = North (N)
 */
export function CompassOverlay() {
  const [rotation, setRotation] = useState(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    let prevDeg = 0
    function tick() {
      const azimuth = getCameraAzimuth()
      const deg = (azimuth * 180) / Math.PI
      // Only trigger React re-render when rotation changes by more than 0.5 degrees
      if (Math.abs(deg - prevDeg) > 0.5) {
        prevDeg = deg
        setRotation(deg)
      }
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
      {/* Outer ring */}
      <div
        className="absolute inset-0 rounded-full border border-white/15"
        style={{
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(8px)',
        }}
      />

      {/* Rotation layer */}
      <div
        className="absolute inset-0"
        style={{
          transform: `rotate(${-rotation}deg)`,
          transition: 'transform 0.1s ease-out',
        }}
      >
        {/* N label (red) */}
        <span
          className="absolute top-1 left-1/2 -translate-x-1/2 font-bold text-red-500"
          style={{ fontSize: 11, fontFamily: 'system-ui, sans-serif', lineHeight: 1 }}
        >
          N
        </span>

        {/* S label */}
        <span
          className="absolute bottom-1 left-1/2 -translate-x-1/2 font-semibold text-white/45"
          style={{ fontSize: 10, fontFamily: 'system-ui, sans-serif', lineHeight: 1 }}
        >
          S
        </span>

        {/* E label */}
        <span
          className="absolute top-1/2 right-1 -translate-y-1/2 font-semibold text-white/45"
          style={{ fontSize: 10, fontFamily: 'system-ui, sans-serif', lineHeight: 1 }}
        >
          E
        </span>

        {/* W label */}
        <span
          className="absolute top-1/2 left-1.5 -translate-y-1/2 font-semibold text-white/45"
          style={{ fontSize: 10, fontFamily: 'system-ui, sans-serif', lineHeight: 1 }}
        >
          W
        </span>

        {/* North needle (red triangle) */}
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

        {/* South needle (gray triangle) */}
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

        {/* Center dot */}
        <div
          className="absolute top-1/2 left-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/50"
        />
      </div>
    </div>
  )
}
