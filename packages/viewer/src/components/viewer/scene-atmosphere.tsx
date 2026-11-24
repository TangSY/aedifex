'use client'

import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { cameraPosition, fog, positionWorld, reference, smoothstep } from 'three/tsl'
import type { Color, Node, Scene, Vector3 } from 'three/webgpu'
import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'

export type SceneAtmosphereSource = {
  skyRadiance(direction: Node<'vec3'>): Node<'vec3'>
  reflectionRadiance(direction: Node<'vec3'>): Node<'vec3'>
  fogRadiance(direction: Node<'vec3'>): Node<'vec3'>
  environmentNode: Node<'vec3'>
  sunDirection: Vector3
  sunColor: Color
  sunIntensity: number
  moonDirection: Vector3
  moonColor: Color
  moonIntensity: number
  skyColor: Color
  groundColor: Color
  hemisphereIntensity: number
  ambientIntensity: number
  exposure: number
  fogStart: number
  fogEnd: number
}

type AtmosphereState = {
  source: SceneAtmosphereSource | null
}

type SceneNodeSnapshot = {
  environmentNode: Node<'vec3'> | null | undefined
  environmentIntensity: number
  fogNode: Node | null | undefined
}

type AtmosphereOwner = {
  id: symbol
  source: SceneAtmosphereSource
  fallback: boolean
  fogNode: Node<'vec4'>
}

type SceneAtmosphereRegistry = {
  base: SceneNodeSnapshot | null
  owners: AtmosphereOwner[]
  store: StoreApi<AtmosphereState>
}

const sceneAtmospheres = new WeakMap<Scene, SceneAtmosphereRegistry>()

function registryFor(scene: Scene): SceneAtmosphereRegistry {
  let registry = sceneAtmospheres.get(scene)
  if (!registry) {
    registry = {
      base: null,
      owners: [],
      store: createStore<AtmosphereState>(() => ({
        source: null,
      })),
    }
    sceneAtmospheres.set(scene, registry)
  }
  return registry
}

function applyActiveOwner(scene: Scene, registry: SceneAtmosphereRegistry): void {
  const active = registry.owners.filter((owner) => !owner.fallback).at(-1) ?? registry.owners.at(-1)
  if (active) {
    scene.environmentNode = active.source.environmentNode
    scene.environmentIntensity = 1
    scene.fogNode = active.fogNode
    registry.store.setState({ source: active.source })
    return
  }

  const base = registry.base
  if (base) {
    scene.environmentNode = base.environmentNode
    scene.environmentIntensity = base.environmentIntensity
    scene.fogNode = base.fogNode
  }
  registry.base = null
  registry.store.setState({ source: null })
}

/** Returns the atmosphere currently owning this React Three Fiber scene. */
export function useSceneAtmosphere(): SceneAtmosphereSource | null {
  const scene = useThree((state) => state.scene)
  const registry = useMemo(() => registryFor(scene), [scene])
  return useStore(registry.store, (state) => state.source)
}

/**
 * Installs a generic radiance source into the current scene. The source object is
 * expected to remain stable while its colors, vectors, and numbers mutate.
 */
export function SceneAtmosphere({
  source,
  fallback = false,
}: {
  source: SceneAtmosphereSource
  fallback?: boolean
}) {
  const scene = useThree((state) => state.scene)
  const invalidate = useThree((state) => state.invalidate)
  const ownerId = useRef(Symbol('scene-atmosphere'))
  const registry = useMemo(() => registryFor(scene), [scene])
  const fogNode = useMemo(() => {
    const offset = positionWorld.sub(cameraPosition)
    const direction = offset.normalize()
    const fogRange: Pick<SceneAtmosphereSource, 'fogStart' | 'fogEnd'> = source
    const fogStart: Node<'float'> = reference<'float', typeof fogRange>(
      'fogStart',
      'float',
      fogRange,
    )
    const fogEnd: Node<'float'> = reference<'float', typeof fogRange>('fogEnd', 'float', fogRange)
    const factor = smoothstep(fogStart, fogEnd, offset.length())
    return fog(source.fogRadiance(direction), factor)
  }, [source])

  useLayoutEffect(() => {
    if (registry.owners.length === 0) {
      registry.base = {
        environmentNode: scene.environmentNode,
        environmentIntensity: scene.environmentIntensity,
        fogNode: scene.fogNode,
      }
    }

    const owner: AtmosphereOwner = { id: ownerId.current, source, fallback, fogNode }
    registry.owners.push(owner)
    applyActiveOwner(scene, registry)
    invalidate()

    return () => {
      const index = registry.owners.findIndex((entry) => entry.id === owner.id)
      if (index < 0) return
      registry.owners.splice(index, 1)
      applyActiveOwner(scene, registry)
      invalidate()
    }
  }, [fallback, fogNode, invalidate, registry, scene, source])

  return null
}
