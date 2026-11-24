import type { Vector3 } from 'three'
import { reference, saturation, vec3 } from 'three/tsl'
import type { ContextNode } from 'three/webgpu'
import type { SceneAtmosphereSource } from '../../components/viewer/scene-atmosphere'
import type { RoomLighting } from './rooms'

export type DaylightAtmosphereSource = SceneAtmosphereSource & {
  kind: 'daylight'
  rooms: RoomLighting
  roomContext: ContextNode<unknown>
  whiteBalance: Vector3
  shadow: {
    mapSize: number
    bias: number
    normalBias: number
    radius: number
  }
}

export function isDaylightAtmosphere(
  source: SceneAtmosphereSource | null | undefined,
): source is DaylightAtmosphereSource {
  return (source as DaylightAtmosphereSource | null | undefined)?.kind === 'daylight'
}

export function daylightGrade(rgb: ReturnType<typeof vec3>, atmosphere: DaylightAtmosphereSource) {
  const whiteBalance = reference('whiteBalance', 'vec3', atmosphere)
  return saturation(rgb.max(0).mul(whiteBalance).div(0.18).pow(vec3(1.06)).mul(0.18), 1.06)
}
