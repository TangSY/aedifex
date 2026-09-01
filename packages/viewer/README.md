# @aedifex/viewer

3D viewer component for Aedifex building editor.

## Installation

```bash
npm install @aedifex/core @aedifex/viewer @aedifex/editor @aedifex/nodes
```

## Peer Dependencies

```bash
npm install next react react-dom three @react-three/fiber @react-three/drei lucide-react zustand
```

## What's Included

- **Viewer Component** - WebGPU-powered 3D viewer with camera controls
- **Node Rendering Runtime** - Registry-driven dispatch for node renderers supplied by `@aedifex/nodes`
- **Post-Processing** - SSGI (ambient occlusion + global illumination), TRAA (anti-aliasing), outline effects
- **Level System** - Level visibility and positioning (stacked/exploded/solo modes)
- **Wall Cutout System** - Dynamic wall hiding based on camera position
- **Asset URL Helpers** - CDN URL resolution for models and textures

## Usage

```typescript
import { loadPlugin } from '@aedifex/core'
import { builtinPlugin } from '@aedifex/nodes'
import { Viewer } from '@aedifex/viewer'
import { useEffect, useState } from 'react'

const registryReady = loadPlugin(builtinPlugin)

function App() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void registryReady.then(() => setReady(true))
  }, [])

  if (!ready) return null

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Viewer />
    </div>
  )
}
```

Load the built-in plugin once, before mounting any viewer. Without it, the registry has no node
definitions and scene nodes cannot render. Host-provided plugins use the same `loadPlugin` API.

## Custom Camera Controls

```typescript
import { Viewer } from '@aedifex/viewer'
import { CameraControls } from '@react-three/drei'

function App() {
  return (
    <Viewer selectionManager="custom">
      <CameraControls />
    </Viewer>
  )
}
```

## 2D and Split-View Embeds

`@aedifex/viewer` owns the 3D canvas. The npm-facing multi-view shell lives in
`@aedifex/editor`, where it can compose that canvas with the read-only SVG floor plan without
coupling editor-only floor-plan state into the viewer runtime.

Use `modes` to expose any combination of `3d`, `2d`, and `split`. A single enabled mode hides the
switcher automatically. `mode` and `onModeChange` can be supplied for controlled embeds; otherwise
`defaultMode` is used.

```tsx
import { ViewerStage, useViewerCameraNavigationSync } from '@aedifex/editor'
import { Viewer } from '@aedifex/viewer'
import { CameraControls, type CameraControlsImpl } from '@react-three/drei'
import { useRef } from 'react'

function SyncedCameraControls() {
  const controls = useRef<CameraControlsImpl>(null)
  const publishCameraPose = useViewerCameraNavigationSync(controls)

  return <CameraControls makeDefault onUpdate={publishCameraPose} ref={controls} />
}

function EmbeddedViewer() {
  return (
    <div style={{ width: 960, height: 640 }}>
      <ViewerStage defaultMode="3d" modes={['3d', '2d']}>
        <Viewer>
          <SyncedCameraControls />
        </Viewer>
      </ViewerStage>
    </div>
  )
}
```

Common configurations:

```tsx
<ViewerStage modes={['3d']}>{viewer}</ViewerStage>
<ViewerStage modes={['2d']} />
<ViewerStage modes={['3d', '2d']}>{viewer}</ViewerStage>
<ViewerStage modes={['3d', 'split']}>{viewer}</ViewerStage>
<ViewerStage modes={['3d', '2d', 'split']}>{viewer}</ViewerStage>
```

For a 2D-only embed, no 3D canvas is mounted. When 3D or split is enabled, the 3D canvas stays
mounted while 2D is active, avoiding renderer reinitialization. Camera poses,
floor-plan pan/zoom/rotation, and the compass synchronize through transient subscriptions; live
navigation does not require a React render per frame. Set `showCompass={false}` or
`showSwitcher={false}` when the host supplies its own controls.

## Viewer State

```typescript
import { useViewer } from '@aedifex/viewer'

function ViewerControls() {
  const levelMode = useViewer(s => s.levelMode)
  const setLevelMode = useViewer(s => s.setLevelMode)
  const wallMode = useViewer(s => s.wallMode)
  const setWallMode = useViewer(s => s.setWallMode)

  return (
    <div>
      <button onClick={() => setLevelMode('stacked')}>Stacked</button>
      <button onClick={() => setLevelMode('exploded')}>Exploded</button>
      <button onClick={() => setWallMode('cutaway')}>Cutaway</button>
      <button onClick={() => setWallMode('up')}>Full Height</button>
    </div>
  )
}
```

## Asset CDN Helpers

```typescript
import { resolveCdnUrl, ASSETS_CDN_URL } from '@aedifex/viewer'

// Resolves relative paths to CDN URLs
const url = resolveCdnUrl('/items/chair/model.glb')
// → 'https://aedifex-cdn.example.com/items/chair/model.glb'

// Handles external URLs and asset:// protocol
const externalUrl = resolveCdnUrl('https://example.com/model.glb')
// → 'https://example.com/model.glb' (unchanged)
```

## Features

- **WebGPU Rendering** - Hardware-accelerated rendering via Three.js WebGPU
- **Post-Processing** - SSGI for realistic lighting, outline effects for selection
- **Level Modes** - Stacked, exploded, or solo level display
- **Wall Cutaway** - Automatic wall hiding for interior views
- **Camera Modes** - Perspective and orthographic projection
- **Scan/Guide Support** - 3D scans and 2D guide images

## License

MIT
