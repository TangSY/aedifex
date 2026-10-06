'use client'

import type { ReactNode } from 'react'
import { useXRWandPanelSettings } from './panel-settings'
import {
  resolveWandPanelFacePose,
  XR_WAND_PANEL_INPUT_NAME,
  XR_WAND_PANEL_LAYOUT,
} from './panel-layout'
import { PanelFace } from './spatial-controls'

export function XRWandPanelShell({
  faces,
  handedness = 'left',
}: {
  faces: readonly ReactNode[]
  handedness?: XRHandedness
}) {
  const panelScale = useXRWandPanelSettings((state) => state.panelScale)

  return (
    <group
      name={XR_WAND_PANEL_INPUT_NAME}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerOver={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      pointerEventsOrder={100}
      pointerEventsType={{ deny: 'grab' }}
      scale={panelScale}
    >
      {faces.map((face, index) => {
        const pose = resolveWandPanelFacePose(index, handedness)
        return (
          <group
            key={XR_WAND_PANEL_LAYOUT.faceAngles[index] ?? index}
            position={pose.position}
            rotation={pose.rotation}
            scale={XR_WAND_PANEL_LAYOUT.faceScale}
          >
            <PanelFace />
            {face}
          </group>
        )
      })}
    </group>
  )
}
