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
