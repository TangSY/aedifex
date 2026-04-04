import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { AmbientLight, DirectionalLight, OrthographicCamera } from 'three/webgpu'
import * as THREE from 'three/webgpu'
import useViewer from '../../store/use-viewer'

export function Lights() {
  const theme = useViewer((state) => state.theme)
  const isDark = theme === 'dark'

  const light1Ref = useRef<DirectionalLight>(null)
  const shadowCamera = useRef<OrthographicCamera>(null)
  const shadowCameraSize = 50 // The "area" around the camera to shadow

  const light2Ref = useRef<DirectionalLight>(null)
  const light3Ref = useRef<DirectionalLight>(null)
  const ambientRef = useRef<AmbientLight>(null)

  const initialized = useRef(false)

  const targets = useMemo(
    () => ({
      l1Color: new THREE.Color(),
      l2Color: new THREE.Color(),
      l3Color: new THREE.Color(),
      ambColor: new THREE.Color(),
    }),
    [],
  )

  // Track whether lerp has converged to skip per-frame work
  const converged = useRef(false)
  const prevIsDark = useRef(isDark)

  useFrame((_, delta) => {
    // Reset convergence when theme changes
    if (prevIsDark.current !== isDark) {
      converged.current = false
      prevIsDark.current = isDark
    }

    // Skip all lerp work when values have converged
    if (converged.current) return

    // clamp delta to avoid huge jumps on tab switch
    const dt = Math.min(delta, 0.1) * 4

    const t1 = isDark ? 0.8 : 4
    const t2 = isDark ? 0.2 : 0.75
    const t3 = isDark ? 0.3 : 1
    const tA = isDark ? 0.15 : 0.5
    const tShadow = isDark ? 0.8 : 0.4

    if (!initialized.current) {
      if (light1Ref.current) {
        light1Ref.current.intensity = t1
        light1Ref.current.color.set(isDark ? '#e0e5ff' : '#ffffff')
        if (light1Ref.current.shadow) light1Ref.current.shadow.intensity = tShadow
      }
      if (light2Ref.current) {
        light2Ref.current.intensity = t2
        light2Ref.current.color.set(isDark ? '#8090ff' : '#ffffff')
      }
      if (light3Ref.current) {
        light3Ref.current.intensity = t3
        light3Ref.current.color.set(isDark ? '#a0b0ff' : '#ffffff')
      }
      if (ambientRef.current) {
        ambientRef.current.intensity = tA
        ambientRef.current.color.set(isDark ? '#a0b0ff' : '#ffffff')
      }
      initialized.current = true
      converged.current = true
      return
    }

    let allConverged = true
    const EPS = 0.001

    if (light1Ref.current) {
      light1Ref.current.intensity = THREE.MathUtils.lerp(light1Ref.current.intensity, t1, dt)
      targets.l1Color.set(isDark ? '#e0e5ff' : '#ffffff')
      light1Ref.current.color.lerp(targets.l1Color, dt)
      if (Math.abs(light1Ref.current.intensity - t1) > EPS) allConverged = false

      if (light1Ref.current.shadow && light1Ref.current.shadow.intensity !== undefined) {
        light1Ref.current.shadow.intensity = THREE.MathUtils.lerp(light1Ref.current.shadow.intensity, tShadow, dt)
      }
    }

    if (light2Ref.current) {
      light2Ref.current.intensity = THREE.MathUtils.lerp(light2Ref.current.intensity, t2, dt)
      targets.l2Color.set(isDark ? '#8090ff' : '#ffffff')
      light2Ref.current.color.lerp(targets.l2Color, dt)
      if (Math.abs(light2Ref.current.intensity - t2) > EPS) allConverged = false
    }

    if (light3Ref.current) {
      light3Ref.current.intensity = THREE.MathUtils.lerp(light3Ref.current.intensity, t3, dt)
      targets.l3Color.set(isDark ? '#a0b0ff' : '#ffffff')
      light3Ref.current.color.lerp(targets.l3Color, dt)
      if (Math.abs(light3Ref.current.intensity - t3) > EPS) allConverged = false
    }

    if (ambientRef.current) {
      ambientRef.current.intensity = THREE.MathUtils.lerp(ambientRef.current.intensity, tA, dt)
      targets.ambColor.set(isDark ? '#a0b0ff' : '#ffffff')
      ambientRef.current.color.lerp(targets.ambColor, dt)
      if (Math.abs(ambientRef.current.intensity - tA) > EPS) allConverged = false
    }

    converged.current = allConverged
  })

  return (
    <>
      <directionalLight
        castShadow
        position={[10, 10, 10]}
        ref={light1Ref}
        shadow-bias={-0.002}
        shadow-mapSize={[1024, 1024]}
        shadow-normalBias={0.3}
        shadow-radius={3}
      >
        <orthographicCamera
          attach="shadow-camera"
          bottom={-shadowCameraSize}
          far={100}
          left={-shadowCameraSize}
          near={1}
          ref={shadowCamera}
          right={shadowCameraSize}
          top={shadowCameraSize}
        />
      </directionalLight>

      <directionalLight position={[-10, 10, -10]} ref={light2Ref} />

      <directionalLight position={[-10, 10, 10]} ref={light3Ref} />

      <ambientLight ref={ambientRef} />
    </>
  )
}
