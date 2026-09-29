'use client'

import type { XRWandAdapter } from './adapter'
import { XRWandBuildPanel } from './build-panel'
import { XRWandPaintPanel } from './paint-panel'
import { XRWandSettingsPanel } from './settings-panel'
import { XRWandPanelShell } from './wand-panel-shell'

export function XRWandPanel({
  adapter,
  handedness = 'left',
}: {
  adapter: XRWandAdapter
  handedness?: XRHandedness
}) {
  return (
    <XRWandPanelShell
      faces={[
        <XRWandPaintPanel adapter={adapter} key="paint" />,
        <XRWandBuildPanel adapter={adapter} key="build" />,
        <XRWandSettingsPanel adapter={adapter} key="settings" />,
      ]}
      handedness={handedness}
    />
  )
}
