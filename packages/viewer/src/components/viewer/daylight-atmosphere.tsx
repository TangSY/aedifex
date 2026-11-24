'use client'

import { useScene } from '@aedifex/core'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BackSide, Color, MathUtils, Mesh, Scene, SphereGeometry, Vector3 } from 'three'
import { pmremTexture, positionWorldDirection, vec3 } from 'three/tsl'
import { MeshBasicNodeMaterial, PMREMGenerator, type WebGPURenderer } from 'three/webgpu'
import { resolveLocation } from '../../lib/daylight/location'
import type { DaylightAtmosphereSource } from '../../lib/daylight/look'
import { daylightRoomContext } from '../../lib/daylight/room-context'
import { RoomLighting } from '../../lib/daylight/rooms'
import { createDaylightSky, type DaylightSky, WEATHER_COVER } from '../../lib/daylight/sky'
import { presetInstant, solarClockInstant, solarLight } from '../../lib/daylight/solar'
import { createRenderStateGuard } from '../../lib/render-state-guard'
import useViewer from '../../store/use-viewer'
import { SceneAtmosphere, useSceneAtmosphere } from './scene-atmosphere'
import { useDaylightRooms } from './use-daylight-rooms'

const SKY_GAIN = 1.15
const SHADOW_SIZE = { low: 1024, medium: 2048, high: 4096 } as const
const MOON = new Color('#9fb4ff')
const UP = new Vector3(0, 1, 0)
const SKY_SAMPLES = [
  UP,
  ...[0.2, 0.65].flatMap((height) =>
    Array.from({ length: 6 }, (_, index) => {
      const angle = (index / 6) * Math.PI * 2 + height
      return new Vector3(Math.cos(angle), height, Math.sin(angle)).normalize()
    }),
  ),
]

function luminance(color: Color) {
  return color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722
}

function makeEnvironment(renderer: WebGPURenderer, sky: DaylightSky) {
  const captureScene = new Scene()
  const geometry = new SphereGeometry(10, 32, 16)
  const material = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false })
  material.colorNode = sky.skyRadiance(positionWorldDirection, { disc: false })
  material.toneMapped = false
  captureScene.add(new Mesh(geometry, material))
  const generator = new PMREMGenerator(renderer)
  const renderWithStateGuard = createRenderStateGuard({ renderer, scene: captureScene })
  let target: ReturnType<PMREMGenerator['fromScene']> | null = null
  return {
    capture() {
      target = renderWithStateGuard(() =>
        generator.fromScene(captureScene, 0, 0.1, 100, {
          size: 128,
          renderTarget: target,
        }),
      )
      return target
    },
    dispose() {
      target?.dispose()
      generator.dispose()
      material.dispose()
      geometry.dispose()
    },
  }
}

function createResources(renderer: WebGPURenderer) {
  const rooms = new RoomLighting()
  rooms.roomPassAvailable = false
  const sky = createDaylightSky()
  const environment = renderer.hasInitialized?.() === true ? makeEnvironment(renderer, sky) : null
  let target: ReturnType<PMREMGenerator['fromScene']> | null = null
  try {
    target = environment?.capture() ?? null
  } catch (error) {
    console.warn('[viewer] Daylight sky reflections unavailable', error)
  }
  const source: DaylightAtmosphereSource = {
    kind: 'daylight',
    rooms,
    roomContext: daylightRoomContext(rooms),
    skyRadiance: (direction) => sky.skyRadiance(direction),
    reflectionRadiance: (direction) => sky.skyRadiance(direction, { disc: false }).mul(SKY_GAIN),
    fogRadiance: (direction) => sky.horizonRadiance(vec3(direction.x, 0.004, direction.z)),
    environmentNode: target ? pmremTexture(target.texture).mul(SKY_GAIN) : vec3(0),
    sunDirection: new Vector3(0, 1, 0),
    sunColor: new Color(1, 1, 1),
    sunIntensity: 3,
    moonDirection: new Vector3(0, 1, 0),
    moonColor: MOON.clone(),
    moonIntensity: 0,
    skyColor: new Color(1, 1, 1),
    groundColor: new Color('#bdb4a4'),
    hemisphereIntensity: target ? 0.12 : 0.45,
    ambientIntensity: 0.04,
    exposure: 1,
    fogStart: 250,
    fogEnd: 2600,
    whiteBalance: new Vector3(1, 1, 1),
    shadow: { mapSize: SHADOW_SIZE.medium, bias: -0.0003, normalBias: 0.045, radius: 2 },
  }

  return {
    rooms,
    sky,
    source,
    refreshEnvironment() {
      if (target) environment?.capture()
    },
    dispose() {
      rooms.roomPassAvailable = false
      environment?.dispose()
      rooms.dispose()
    },
  }
}

type Resources = ReturnType<typeof createResources>

function DaylightScene({
  resources: { rooms, sky, source, refreshEnvironment },
}: {
  resources: Resources
}) {
  const owner = useSceneAtmosphere()
  const active = owner === source
  const { time, weather, quality } = useViewer((state) => state.daylight)
  const site = useScene((state) => {
    for (const id of state.rootNodeIds) {
      const node = state.nodes[id]
      if (node?.type === 'site') return node
    }
  })
  const invalidate = useThree((state) => state.invalidate)
  const [liveNow, setLiveNow] = useState(() => new Date())
  const meter = useRef({ key: 0, sky: 0, night: 0, ev: 0, illuminant: new Color() })
  const eyePosition = useMemo(() => new Vector3(), [])
  const whiteBalance = useMemo(() => new Vector3(1, 1, 1), [])

  useDaylightRooms(rooms, active)

  useEffect(() => {
    if (time !== 'live' || !active) return
    const tick = () => setLiveNow(new Date())
    tick()
    const interval = setInterval(tick, 60_000)
    return () => clearInterval(interval)
  }, [active, time])

  useLayoutEffect(() => {
    if (!active) {
      rooms.roomPassAvailable = false
      return
    }
    source.shadow.mapSize = SHADOW_SIZE[quality]
    rooms.softRooms.value = quality === 'low' ? 0 : 1
    rooms.skyPatch.value = quality === 'low' ? 0 : 3
    rooms.refresh()
    invalidate()
  }, [active, invalidate, quality, rooms, source])

  useLayoutEffect(() => {
    if (!active) return
    const { location } = resolveLocation(site, undefined)
    const { lat, lng } = location
    const day = new Date()
    const instant =
      time === 'live'
        ? liveNow
        : typeof time === 'number'
          ? solarClockInstant(day, lng, time)
          : presetInstant(day, lat, lng, time)
    const sun = solarLight(instant, lat, lng, site?.northRotation ?? 0)
    const cover = WEATHER_COVER[weather]
    sky.update(sun, cover)

    const sunlight = 3.4 * sun.strength * (1 - 0.5 * cover ** 1.6)
    if (sun.elevation < 1) {
      source.sunDirection
        .set(-sun.direction.x, Math.max(0.5, Math.abs(sun.direction.y)), -sun.direction.z)
        .normalize()
      source.sunColor.copy(MOON)
      source.sunIntensity = 0.18 * sun.night
    } else {
      source.sunDirection.copy(sun.direction)
      source.sunColor.copy(sun.color)
      source.sunIntensity = sunlight
    }
    source.shadow.radius = 1.6 + 2.2 * (1 - MathUtils.smoothstep(sun.elevation, 2, 30)) + cover * 3
    const skyColor = new Color(0, 0, 0)
    let weight = 0
    for (const direction of SKY_SAMPLES) {
      skyColor.add(sky.radianceCpu(direction).multiplyScalar(direction.y))
      weight += direction.y
    }
    skyColor.multiplyScalar(SKY_GAIN / weight)
    source.skyColor.copy(skyColor)
    const current = meter.current
    current.key = source.sunIntensity * Math.max(0.15, source.sunDirection.y)
    current.sky = Math.PI * luminance(skyColor)
    current.night = sun.night
    current.illuminant.copy(skyColor).multiplyScalar(Math.PI)
    current.illuminant.add(source.sunColor.clone().multiplyScalar(current.key))
    rooms.virtualLampsOn = sun.elevation < -2
    rooms.updateSky(
      (direction) => sky.radianceCpu(direction).multiplyScalar(SKY_GAIN),
      sun.direction,
      sun.color,
      sun.elevation >= 1 ? sunlight : 0,
    )
    try {
      refreshEnvironment()
    } catch (error) {
      console.warn('[viewer] Could not refresh daylight sky reflections', error)
    }
    invalidate()
  }, [active, invalidate, liveNow, refreshEnvironment, rooms, site, sky, source, time, weather])

  useFrame(({ camera }, delta) => {
    if (!active) return
    const dt = Math.min(0.1, delta)
    const current = meter.current
    source.fogEnd = Math.min(2600, camera.far * 0.9)
    source.fogStart = Math.min(250, source.fogEnd * 0.1)
    sky.cloudTime.value += dt
    const { room, inside } = rooms.isEnclosedAt(camera.getWorldPosition(eyePosition))
    const viewed = inside
      ? null
      : rooms.viewedMeter(
          camera,
          current.key + current.sky,
          current.sky,
          current.illuminant,
          current.sky,
        )
    const light = viewed?.sceneE ?? rooms.meter(room, current.sky)
    const ev = MathUtils.clamp(
      Math.log2(3.2 / Math.max(light, 1e-4)) * 0.6 + (inside ? 0.35 : 0),
      -0.5,
      inside ? 2.4 : 2.2,
    )
    current.ev = MathUtils.damp(current.ev, ev, 3, dt)
    source.exposure = 2 ** current.ev
    rooms.emitterExpInv.value = 1 / source.exposure

    const illuminant =
      (inside ? rooms.roomIlluminant(room, current.illuminant, current.sky) : viewed?.illuminant) ??
      current.illuminant
    const level = luminance(illuminant)
    if (level <= 1e-5) return
    const strength = 0.75 * (1 - 0.35 * current.night)
    whiteBalance
      .set(
        MathUtils.lerp(1, level / Math.max(illuminant.r, 1e-4), strength),
        MathUtils.lerp(1, level / Math.max(illuminant.g, 1e-4), strength),
        MathUtils.lerp(1, level / Math.max(illuminant.b, 1e-4), strength),
      )
      .clampScalar(0.5, 2)
    whiteBalance.divideScalar(
      whiteBalance.x * 0.2126 + whiteBalance.y * 0.7152 + whiteBalance.z * 0.0722,
    )
    source.whiteBalance.lerp(whiteBalance, Math.min(1, dt * 2))
  }, -2)

  return <SceneAtmosphere fallback source={source} />
}

export function DaylightAtmosphere() {
  const renderer = useThree((state) => state.gl) as unknown as WebGPURenderer
  const [resources, setResources] = useState<Resources | null>(null)
  useLayoutEffect(() => {
    const created = createResources(renderer)
    setResources(created)
    return created.dispose
  }, [renderer])

  return resources && <DaylightScene resources={resources} />
}
