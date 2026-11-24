// Copyright (c) 2026 Pascal Group Inc.
// SPDX-License-Identifier: MIT

'use client'

import { sceneRegistry, useInteractive, useScene } from '@aedifex/core'
import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import { Box3, type Object3D, Vector3 } from 'three'
import { DEFAULT_TEXTURE_LIMIT } from '../../lib/daylight/room-map'
import {
  bakedLevelObjects,
  bakedRoomScene,
  bakedRoomSource,
  daylightLampFeeds,
  liveDoorOpenness,
  liveLevelObjects,
  liveRoomScene,
  restoreLampEmitters,
  sceneContains,
  syncLampEmitters,
} from '../../lib/daylight/room-scene'
import type { RoomLighting } from '../../lib/daylight/rooms'
import { SCENE_LAYER } from '../../lib/layers'
import useViewer from '../../store/use-viewer'

const CHECK_INTERVAL = 0.5
const REBUILD_DELAY = 0.4
const SETTLE_WAIT = 10
const LAMP_POSITION_STEP = 0.05

const roomTypes = new Set([
  'site',
  'building',
  'level',
  'zone',
  'wall',
  'separator',
  'window',
  'door',
  'slab',
  'ceiling',
  'roof',
  'roof-segment',
])

function initialState() {
  return {
    signature: '',
    bakedRoot: null as Object3D | null,
    nodesVersion: 0,
    sinceCheck: CHECK_INTERVAL,
    pendingSince: -1,
    settles: 0,
    wasDirty: false,
    builtDirty: Number.POSITIVE_INFINITY,
    objects: [] as (Object3D | undefined)[],
    builtObjects: [] as (Object3D | undefined)[],
    positions: [] as number[],
  }
}

/** Rebuilds from settled geometry; level animation, door motion, and switches update in place. */
export function useDaylightRooms(rooms: RoomLighting, active: boolean): void {
  const scene = useThree((value) => value.scene)
  const gl = useThree((value) => value.gl)
  const state = useRef(initialState())
  const point = useRef(new Vector3()).current

  // biome-ignore lint/correctness/useExhaustiveDependencies: a replacement room map needs a fresh scene rebuild.
  useLayoutEffect(() => {
    state.current = initialState()
    if (!active) return
    const unsubscribe = useScene.subscribe((next, previous) => {
      if (next.nodes !== previous.nodes && roomInputsChanged(next.nodes, previous.nodes))
        state.current.nodesVersion++
    })
    return () => {
      unsubscribe()
      restoreLampEmitters(scene)
    }
  }, [active, rooms, scene])

  useFrame((_, delta) => {
    if (!active) return
    const current = state.current
    const viewer = useViewer.getState()
    const lampDefault = rooms.virtualLampsOn ?? useInteractive.getState().lampDefault
    const baked = bakedRoomSource(scene)
    const bakedRoot = baked?.root ?? null
    const { dirtyNodes, nodes } = useScene.getState()
    let dirty = 0
    if (!baked) {
      for (const id of dirtyNodes) {
        const node = nodes[id]
        if (node && roomTypes.has(node.type) && sceneContains(scene, sceneRegistry.nodes.get(id)))
          dirty++
      }
    }
    if (current.wasDirty && dirty === 0) current.settles++
    current.wasDirty = dirty > 0

    current.sinceCheck += delta
    if (current.sinceCheck >= CHECK_INTERVAL || current.bakedRoot !== bakedRoot) {
      current.sinceCheck = 0
      current.bakedRoot = bakedRoot
      const feed = feedSignature(scene, point)
      const signature = baked
        ? `baked|${baked.root.uuid}|${feed}`
        : `live|${sceneRegistry.revision}|${current.nodesVersion}|${viewer.geometryRevision}|${current.settles}|${feed}`
      if (signature !== current.signature) {
        current.signature = signature
        if (current.pendingSince < 0) current.pendingSince = 0
        current.objects = baked ? bakedLevelObjects(baked.root) : liveLevelObjects(scene)
      }
      syncLampEmitters(scene, rooms)
    }

    const positions = current.objects.map((object) => object?.getWorldPosition(point).y ?? 0)
    const levelsMoved = positions.some(
      (y, index) => Math.abs(y - (current.positions[index] ?? y)) > 1e-4,
    )
    current.positions = positions
    if (current.pendingSince >= 0) {
      current.pendingSince += delta
      const exploded = viewer.levelMode === 'exploded' && !viewer.walkthroughMode
      if (
        current.pendingSince >= REBUILD_DELAY &&
        !exploded &&
        !levelsMoved &&
        (dirty === 0 || current.pendingSince > SETTLE_WAIT)
      ) {
        scene.updateMatrixWorld(true)
        const input = baked
          ? bakedRoomScene(scene, baked.root, lampDefault)
          : liveRoomScene(scene, lampDefault)
        rooms.map.textureLimit = textureLimit(gl)
        rooms.build(
          input ?? {
            bounds: new Box3(),
            levels: [],
            zones: [],
            covers: [],
            walls: [],
            openings: [],
            lamps: [],
            virtualLampsOn: lampDefault,
          },
        )
        current.builtObjects = current.objects
        current.pendingSince = dirty > 0 && dirty < current.builtDirty ? 0 : -1
        current.builtDirty = dirty > 0 ? dirty : Number.POSITIVE_INFINITY
        syncLampEmitters(scene, rooms)
      }
    }

    const offsets = current.builtObjects.map((object, index) => {
      const y = rooms.levels[index]?.y ?? 0
      return object ? object.getWorldPosition(point).y - y : 0
    })
    const shown = current.builtObjects.map((object) => !!object && presented(scene, object))
    const focusId =
      viewer.levelMode === 'solo' || viewer.hideLevelsAboveSelection
        ? viewer.selection.levelId
        : null
    const liveFocus = focusId && !baked ? sceneRegistry.nodes.get(focusId) : undefined
    const selected = current.builtObjects.map(
      (object) =>
        !!object &&
        (object === liveFocus || (!!baked && !!focusId && object.userData.pascalId === focusId)),
    )
    rooms.setLevelPresentation(offsets, shown, selected)

    const lit = new Set<string>()
    for (const feed of daylightLampFeeds(scene))
      for (const lamp of feed.lights()) if (feed.intensity(lamp) > 0) lit.add(lamp.key)
    if (rooms.setLampStates((lamp) => (lamp.itemId ? lit.has(lamp.itemId) : lampDefault)))
      syncLampEmitters(scene, rooms)
    rooms.updateDoors(baked?.doorOpenness ?? liveDoorOpenness)
  })
}

function feedSignature(scene: Object3D, point: Vector3): string {
  const entries: string[] = []
  const quantize = (value: number) => Math.round(value / LAMP_POSITION_STEP)
  for (const feed of daylightLampFeeds(scene)) {
    for (const lamp of feed.lights()) {
      if (lamp.getWorldPosition(point))
        entries.push(`${lamp.key}@${quantize(point.x)},${quantize(point.y)},${quantize(point.z)}`)
    }
  }
  return entries.join(';')
}

type RoomInputNodes = Readonly<Record<string, { type: string } | undefined>>

function roomInputsChanged(next: RoomInputNodes, previous: RoomInputNodes): boolean {
  for (const id in next) {
    const node = next[id]
    const before = previous[id]
    if (node === before || !roomTypes.has((node ?? before)?.type ?? '')) continue
    if (node && before && onlyChildrenDiffer(node, before)) continue
    return true
  }
  for (const id in previous) {
    if (!(id in next) && roomTypes.has(previous[id]?.type ?? '')) return true
  }
  return false
}

function onlyChildrenDiffer(first: object, second: object): boolean {
  const a = first as Record<string, unknown>
  const b = second as Record<string, unknown>
  for (const key in a) if (key !== 'children' && a[key] !== b[key]) return false
  for (const key in b) if (key !== 'children' && !(key in a)) return false
  return true
}

function presented(scene: Object3D, object: Object3D): boolean {
  if (!object.layers.isEnabled(SCENE_LAYER)) return false
  for (let node: Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return false
    if (node === scene) return true
  }
  return false
}

function textureLimit(renderer: unknown): number {
  const { backend } = renderer as {
    backend?: {
      device?: { limits?: { maxTextureDimension2D?: number } }
      gl?: WebGL2RenderingContext
    }
  }
  const limit =
    backend?.device?.limits?.maxTextureDimension2D ??
    (backend?.gl?.getParameter(backend.gl.MAX_TEXTURE_SIZE) as number | undefined)
  return limit && limit > 0 ? limit : DEFAULT_TEXTURE_LIMIT
}
