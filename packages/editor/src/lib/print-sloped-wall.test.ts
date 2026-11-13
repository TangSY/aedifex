import { expect, test } from 'bun:test'
import { WallNode } from '@aedifex/core'
import * as THREE from 'three'
import { prepareSemanticPrintShellSource } from './print-shell-compiler'
import { buildPrintableWallSolids } from './print-wall-solids'

test('sloped walls cannot silently become flat printable solids', () => {
  for (const offset of [-1, 1]) {
    const wall = WallNode.parse({
      id: 'wall_print-slope',
      start: [0, 0],
      end: [4, 0],
      height: 2.5,
      endHeightOffset: offset,
    })
    const direct = buildPrintableWallSolids(wall, { effectiveHeight: 2.5 })
    if (direct.status === 'ready')
      direct.object.traverse((object) => (object as THREE.Mesh).geometry?.dispose())
    expect(direct.status).toBe('blocked')
    expect(direct.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'unsupported_wall_print_slope', nodeIds: [wall.id] }),
    )
    const root = new THREE.Group()
    const wallRoot = new THREE.Group()
    wallRoot.userData.pascalId = wall.id
    root.add(wallRoot)
    const semantic = prepareSemanticPrintShellSource(
      root,
      { [wall.id]: wall },
      { wallSolids: true },
    )
    semantic.dispose()
    expect(semantic.status).toBe('blocked')
    expect(semantic.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'unsupported_wall_print_slope', nodeIds: [wall.id] }),
    )
  }
})
