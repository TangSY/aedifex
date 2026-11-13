'use client'

import { PrecisePlacementInput } from '../../tools/shared/precise-placement-input'

/** Scale the HTML control in screen pixels while keeping it upright in the rotated plan. */
export function PrecisePlacementPlanHud({
  anchor,
  unitsPerPixel,
  sceneRotationDeg,
  placeholders,
}: {
  anchor: readonly [number, number]
  unitsPerPixel: number
  sceneRotationDeg: number
  placeholders?: readonly string[]
}) {
  const scale = Math.max(unitsPerPixel, 1e-6)
  return (
    <g transform={`translate(${anchor[0]} ${anchor[1]}) rotate(${-sceneRotationDeg})`}>
      <foreignObject
        width={260 * scale}
        height={56 * scale}
        x={-130 * scale}
        y={-70 * scale}
        overflow="visible"
        pointerEvents="none"
      >
        <div
          style={{
            width: 260,
            height: 56,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            pointerEvents: 'auto',
          }}
        >
          <PrecisePlacementInput placeholders={placeholders} />
        </div>
      </foreignObject>
    </g>
  )
}
