import { describe, expect, test } from 'bun:test'
import { Group, Mesh } from 'three'
import { isDirectR3FPointerTarget, isR3FPointerTarget } from './pointer-filter'
import { useXRPlayerMode } from './mode-switching/store/player-mode'

function markInteractive(object: Group | Mesh) {
  ;(object as unknown as { __r3f: unknown }).__r3f = { eventCount: 6 }
}

describe('isDirectR3FPointerTarget', () => {
  test('transition lock suppresses UI and scene targets until rearmed', () => {
    const button = new Mesh()
    markInteractive(button)
    const state = useXRPlayerMode.getState()
    state.setTransitionPhase('fade-out')
    expect(isR3FPointerTarget(button)).toBe(false)
    state.setTransitionPhase('rearm')
    expect(isR3FPointerTarget(button)).toBe(false)
    state.reset()
    expect(isR3FPointerTarget(button)).toBe(true)
  })
  test('keeps an explicit collision mesh ahead of its passive rendered sibling', () => {
    const passiveWallBody = new Mesh()
    const wallCollisionMesh = new Mesh()
    const interactiveLevelWrapper = new Group()

    markInteractive(interactiveLevelWrapper)
    interactiveLevelWrapper.add(passiveWallBody, wallCollisionMesh)
    markInteractive(wallCollisionMesh)

    expect(isDirectR3FPointerTarget(passiveWallBody)).toBe(false)
    expect(isDirectR3FPointerTarget(wallCollisionMesh)).toBe(true)
    expect(isR3FPointerTarget(passiveWallBody)).toBe(false)
    expect(isR3FPointerTarget(wallCollisionMesh)).toBe(true)
  })

  test('keeps an explicit collision child ahead of its passive rendered parent', () => {
    const passiveWallBody = new Mesh()
    const wallCollisionMesh = new Mesh()
    const interactiveWrapper = new Group()

    markInteractive(interactiveWrapper)
    markInteractive(wallCollisionMesh)
    passiveWallBody.add(wallCollisionMesh)
    interactiveWrapper.add(passiveWallBody)

    expect(isR3FPointerTarget(passiveWallBody)).toBe(false)
    expect(isR3FPointerTarget(wallCollisionMesh)).toBe(true)
  })

  test('inherits pointer handlers for nested imported meshes', () => {
    const interactiveItemWrapper = new Group()
    const importedGroup = new Group()
    const importedMesh = new Mesh()
    markInteractive(interactiveItemWrapper)
    interactiveItemWrapper.add(importedGroup)
    importedGroup.add(importedMesh)

    expect(isR3FPointerTarget(importedMesh)).toBe(true)
  })

  test('rejects geometry with no eventful ancestor', () => {
    expect(isR3FPointerTarget(new Mesh())).toBe(false)
  })

  test('hidden or disabled panels cannot steal floor drawing rays', () => {
    const panel = new Group()
    const button = new Mesh()
    markInteractive(button)
    panel.add(button)
    expect(isR3FPointerTarget(button)).toBe(true)
    panel.visible = false
    expect(isR3FPointerTarget(button)).toBe(false)
    panel.visible = true
    panel.pointerEvents = 'none'
    expect(isR3FPointerTarget(button)).toBe(false)
  })
})


describe('opening selection proxies', () => {
  test('accepts an invisible opening proxy under its interactive door or window', () => {
    const opening = new Mesh()
    markInteractive(opening)
    const cutout = new Mesh()
    cutout.name = 'cutout'
    cutout.visible = false
    opening.add(cutout)
    expect(isR3FPointerTarget(cutout)).toBe(true)
    opening.visible = false
    expect(isR3FPointerTarget(cutout)).toBe(false)
    opening.visible = true
    opening.pointerEvents = 'none'
    expect(isR3FPointerTarget(cutout)).toBe(false)
  })

  test('does not enable unrelated hidden geometry', () => {
    const parent = new Group()
    markInteractive(parent)
    const child = new Mesh()
    child.visible = false
    parent.add(child)
    expect(isR3FPointerTarget(child)).toBe(false)
    child.name = 'cutout'
    child.pointerEvents = 'none'
    expect(isR3FPointerTarget(child)).toBe(false)
  })
})
