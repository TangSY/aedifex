'use client'

import type { RefObject } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/primitives/tooltip'

export function FloorplanCompassButton({
  northRotationDeg,
  onAlignNorth,
  needleRef,
}: {
  northRotationDeg: number
  onAlignNorth: () => void
  needleRef?: RefObject<SVGSVGElement | null>
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label="Align view to north"
          className="group absolute top-14 right-4 z-30 flex h-16 w-16 items-center justify-center rounded-full border border-white/15 bg-black/55 shadow-lg backdrop-blur-md transition hover:bg-black/70 hover:shadow-xl"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onAlignNorth()
          }}
          onPointerDown={(event) => {
            event.stopPropagation()
          }}
          type="button"
        >
          <span className="relative flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-black/20 shadow-inner">
            <svg
              aria-hidden="true"
              className="h-14 w-14 transition-transform duration-100 ease-out"
              ref={needleRef}
              style={{ transform: `rotate(${northRotationDeg}deg)` }}
              viewBox="0 0 64 64"
            >
              <text
                fill="#ef4444"
                fontFamily="system-ui, sans-serif"
                fontSize="11"
                fontWeight="700"
                textAnchor="middle"
                x="32"
                y="12"
              >
                N
              </text>
              <text
                fill="rgba(255,255,255,0.6)"
                fontFamily="system-ui, sans-serif"
                fontSize="9"
                fontWeight="600"
                textAnchor="middle"
                x="32"
                y="58"
              >
                S
              </text>
              <text
                dominantBaseline="middle"
                fill="rgba(255,255,255,0.6)"
                fontFamily="system-ui, sans-serif"
                fontSize="9"
                fontWeight="600"
                textAnchor="middle"
                x="54"
                y="32"
              >
                E
              </text>
              <text
                dominantBaseline="middle"
                fill="rgba(255,255,255,0.6)"
                fontFamily="system-ui, sans-serif"
                fontSize="9"
                fontWeight="600"
                textAnchor="middle"
                x="10"
                y="32"
              >
                W
              </text>
              <path d="M32 15 36 29 32 26 28 29Z" fill="#ef4444" />
              <path d="M32 49 28 35 32 38 36 35Z" fill="rgba(255,255,255,0.28)" />
              <circle cx="32" cy="32" fill="rgba(255,255,255,0.65)" r="2" />
            </svg>
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">Align view to north</TooltipContent>
    </Tooltip>
  )
}
