import { describe, expect, test } from 'bun:test'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import { isSpatialUIObject, rayHitsSpatialUI, SpatialUIInputOwnership } from './spatial-ui'

describe('spatial UI input routing', () => {
  test('entry preview claims clicks instead of editing the scene behind it', () => {
    const root = new Group()
    root.name = 'xr-entry-preview'
    const button = new Mesh(new BoxGeometry(0.1, 0.1, 0.01), new MeshBasicMaterial())
    button.position.z = -0.5
    root.add(button)
    const scene = new Group().add(root)
    const ray = new Raycaster(new Vector3(), new Vector3(0, 0, -1))
    expect(rayHitsSpatialUI(scene, ray)).toBe(true)
    root.visible = false
    expect(rayHitsSpatialUI(scene, ray)).toBe(false)
    button.geometry.dispose()
    button.material.dispose()
  })
  test('blocks scene rays on the workspace, but not hidden content', () => {
    const scene = new Group()
    const panel = new Group()
    panel.name = 'xr-editor-wand-panel'
    const content = new Group()
    const mesh = new Mesh(new BoxGeometry(1, 1, 0.01), new MeshBasicMaterial())
    mesh.position.z = -1
    content.add(mesh)
    panel.add(content)
    scene.add(panel)
    const ray = new Raycaster(new Vector3(), new Vector3(0, 0, -1))
    expect(rayHitsSpatialUI(scene, ray)).toBe(true)
    content.visible = false
    expect(rayHitsSpatialUI(scene, ray)).toBe(false)
    content.visible = true
    panel.pointerEvents = 'none'
    expect(rayHitsSpatialUI(scene, ray)).toBe(false)
    panel.pointerEvents = 'auto'
    expect(rayHitsSpatialUI(scene, ray)).toBe(true)
    scene.visible = false
    expect(isSpatialUIObject(mesh)).toBe(false)
    mesh.geometry.dispose()
    mesh.material.dispose()
  })

  test('the wrist shortcut blocks scene input even when the panel is hidden', () => {
    const scene = new Group()
    const panel = new Group()
    panel.name = 'xr-editor-wand-panel'
    panel.visible = false
    const shortcut = new Group()
    shortcut.name = 'xr-workspace-hand-shortcut'
    const mesh = new Mesh(new BoxGeometry(0.1, 0.1, 0.01), new MeshBasicMaterial())
    mesh.position.z = -0.5
    shortcut.add(mesh)
    scene.add(panel, shortcut)
    expect(isSpatialUIObject(mesh)).toBe(true)
    expect(rayHitsSpatialUI(scene, new Raycaster(new Vector3(), new Vector3(0, 0, -1)))).toBe(true)
    shortcut.visible = false
    expect(rayHitsSpatialUI(scene, new Raycaster(new Vector3(), new Vector3(0, 0, -1)))).toBe(false)
    mesh.geometry.dispose()
    mesh.material.dispose()
  })

  test('retains UI press ownership off the panel and releases on tracking loss', () => {
    const ownership = new SpatialUIInputOwnership()
    const left = { handedness: 'left' } as XRInputSource
    const right = { handedness: 'right' } as XRInputSource
    ownership.hover(left, true)
    ownership.press(left, true)
    ownership.hover(left, false)
    expect(ownership.busy('left')).toBe(true)
    expect(ownership.busy('right')).toBe(false)
    ownership.release(left)
    expect(ownership.busy('left')).toBe(false)
    ownership.press(right, true)
    ownership.remove(right)
    expect(ownership.busy('right')).toBe(false)
  })
})
