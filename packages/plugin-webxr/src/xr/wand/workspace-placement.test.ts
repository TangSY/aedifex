import { describe, expect, test } from 'bun:test'
import { Group, Quaternion, Vector3 } from 'three'
import { sidePanelPose } from './panel-layout'
import {
  placeWorkspace,
  workspaceParentPoint,
  WorkspaceDrag,
  WorkspaceAnchor,
  WorkspaceLayout,
  workspaceFacing,
  selectionWorkspacePosition,
  approachWorkspace,
} from './workspace-placement'

describe('floating workspace placement and drag ownership', () => {
  test('opens ahead of the user without inheriting head pitch', () => {
    const eye = new Vector3(5, 2, -3)
    const point = placeWorkspace(eye, new Vector3(1, -1, 0), new Vector3())
    expect(point.x).toBeCloseTo(6.05)
    expect(point.y).toBeCloseTo(1.9)
    expect(point.z).toBe(-3)
    expect(eye.toArray()).toEqual([5, 2, -3])
  })

  test('converts ray hits into the workspace parent coordinate system before dragging', () => {
    const parent = new Group()
    parent.position.set(4, 2, -3)
    parent.rotation.y = Math.PI / 2
    parent.scale.setScalar(2)
    const workspace = new Group()
    parent.add(workspace)
    parent.updateWorldMatrix(true, true)

    const local = new Vector3(0.25, -0.5, 1)
    const world = parent.localToWorld(local.clone())
    expect(workspaceParentPoint(workspace, world).toArray()).toEqual(local.toArray())
  })

  test('looking vertically still gives a finite, reachable position', () => {
    const point = placeWorkspace(new Vector3(), new Vector3(0, 1, 0), new Vector3())
    expect(point.toArray()).toEqual([0, -0.1, -1.05])
  })

  test('a second pointer cannot steal, move, or release a drag', () => {
    const drag = new WorkspaceDrag()
    const target = new Vector3()
    expect(drag.start(1, new Vector3(0, 0, -1), new Vector3(0, 0.3, -1))).toBe(true)
    expect(drag.start(2, new Vector3(), new Vector3())).toBe(false)
    expect(drag.move(2, new Vector3(1, 0, -1), target)).toBe(false)
    expect(drag.end(2)).toBe(false)
    expect(drag.move(1, new Vector3(0.2, 0, -1), target)).toBe(true)
    expect(target.distanceTo(new Vector3(0.2, 0.3, -1))).toBeLessThan(1e-8)
    expect(target.clone().normalize().distanceTo(new Vector3(0.2, 0.3, -1).normalize())).toBeLessThan(1e-8)
    expect(drag.end(1)).toBe(true)
    expect(drag.move(1, new Vector3(), target)).toBe(false)
    expect(drag.start(2, new Vector3(), new Vector3(0, 0, -1))).toBe(true)
  })

  test('independent workspace drags do not share their grab offsets', () => {
    const a = new WorkspaceDrag()
    const b = new WorkspaceDrag()
    a.start(1, new Vector3(0, 0, -1), new Vector3(0, 0.2, -1))
    b.start(2, new Vector3(0, 0, -1), new Vector3(0, -0.3, -1))
    const target = new Vector3()
    a.move(1, new Vector3(0, 0, -1), target)
    expect(target.y).toBeCloseTo(0.2)
  })

  test('dragging moves vertically and preserves the initial grab offset', () => {
    const drag = new WorkspaceDrag()
    const target = new Vector3()
    drag.start(1, new Vector3(0, -0.4, -1.05), new Vector3(0, -0.1, -1.05))
    expect(drag.move(1, new Vector3(0.2, 0.3, -1.05), target)).toBe(true)
    expect(target.distanceTo(new Vector3(0.2, 0.6, -1.05))).toBeLessThan(1e-8)
    expect(target.y).toBeGreaterThan(0)
    expect(target.clone().normalize().distanceTo(new Vector3(0.2, 0.6, -1.05).normalize())).toBeLessThan(1e-8)
  })

  test('panel faces the eyes at different elevations with a level horizontal edge', () => {
    for (const position of [new Vector3(0.4, 0.8, -1), new Vector3(-0.5, -0.7, -1)]) {
      const rotation = workspaceFacing(position, new Quaternion())
      const front = new Vector3(0, 0, 1).applyQuaternion(rotation)
      expect(front.dot(position.clone().negate().normalize())).toBeCloseTo(1)
      expect(new Vector3(1, 0, 0).applyQuaternion(rotation).y).toBeCloseTo(0)
    }
  })

  test('compound facing stays level throughout smoothing and crosses the yaw seam by the short path', () => {
    const rotation = workspaceFacing(new Vector3(1, -0.5, -1), new Quaternion())
    for (let i = 0; i < 90; i++) {
      workspaceFacing(new Vector3(-1, 0.7, -1), rotation, 1 / 90)
      expect(new Vector3(1, 0, 0).applyQuaternion(rotation).y).toBeCloseTo(0)
    }
    const seam = workspaceFacing(new Vector3(0.01, 0, 1), new Quaternion())
    const before = seam.clone()
    workspaceFacing(new Vector3(-0.01, 0, 1), seam, 1 / 90)
    expect(before.angleTo(seam)).toBeLessThan(0.01)
  })

  test('walking and mode transitions preserve local offset and physical size', () => {
    const parent = new Group()
    parent.position.set(4, 2, 6)
    parent.rotation.set(0.2, 0.6, 0)
    parent.scale.set(2, 3, 4)
    const anchor = new Group()
    const panel = new Group()
    parent.add(anchor)
    anchor.add(panel)
    panel.position.set(0.3, 0.5, -1.05)
    const follow = new WorkspaceAnchor()
    for (const eye of [new Vector3(0, 1.6, 0), new Vector3(1, 1.8, 2), new Vector3(0, 6, 8)]) {
      follow.update(eye, new Vector3(0, 0, -1))
      follow.apply(anchor)
      expect(panel.getWorldPosition(new Vector3()).distanceTo(eye.clone().add(panel.position))).toBeLessThan(1e-8)
      expect(panel.getWorldScale(new Vector3()).distanceTo(new Vector3(1, 1, 1))).toBeLessThan(1e-8)
    }
  })

  test('walking preserves heading while player-rig turns rotate the parked offset', () => {
    const follow = new WorkspaceAnchor()
    const rigForward = new Vector3(0, 0, -1)
    follow.update(new Vector3(), rigForward)
    const before = follow.rotation.clone()
    // Head position can change without any change in the rig's rotation.
    follow.update(new Vector3(1, 2, 3), rigForward)
    expect(follow.rotation.angleTo(before)).toBeCloseTo(0)
    expect(follow.position.toArray()).toEqual([1, 2, 3])
    follow.update(new Vector3(), new Vector3(-1, 0, 0))
    expect(new Vector3(0, 0, -1).applyQuaternion(follow.rotation).x).toBeCloseTo(-1)
  })

  test('selection takes one gaze snapshot below the sightline in body coordinates', () => {
    const eye = new Vector3(3, 2, 4)
    const direction = new Vector3(1, 0, 0)
    const point = selectionWorkspacePosition(eye, direction, new Vector3())
    expect(point.toArray()).toEqual([4.05, 1.62, 4])
    direction.set(0, 0, -1)
    expect(point.toArray()).toEqual([4.05, 1.62, 4])
  })

  test('recall from behind stays away from the eyes and is frame-rate independent', () => {
    const target = new Vector3(0, -0.38, -1.05)
    const run = (fps: number) => {
      const position = new Vector3(0, 0, 1.05)
      for (let i = 0; i < fps; i++) {
        approachWorkspace(position, target, 1 / fps, 7)
        expect(position.length()).toBeGreaterThanOrEqual(1.0499)
      }
      return position
    }
    const a = run(72)
    expect(a.distanceTo(run(120))).toBeLessThan(1e-8)
    expect(a.distanceTo(target)).toBeLessThan(0.01)
  })
})


describe('workspace recall group and parked panel offset', () => {
  const settle = (layout: WorkspaceLayout) => {
    for (let i = 0; i < 240; i++) layout.update(1 / 90, 7)
  }

  test('selection and manual recalls preserve the intended offset, even before a drag settles', () => {
    const layout = new WorkspaceLayout()
    layout.recall(new Vector3(0, -0.1, -1.05), true)
    layout.startDrag()
    const parked = new Vector3(0.7, 0.15, -0.2)
    layout.dragTo(parked)
    layout.update(1 / 90, 24)
    layout.recall(new Vector3(-1.05, -0.38, 0))
    settle(layout)
    expect(layout.panelOffset.distanceTo(parked)).toBeLessThan(1e-8)
    layout.recall(new Vector3(1.05, -0.1, 0))
    settle(layout)
    expect(layout.panelOffset.distanceTo(parked)).toBeLessThan(1e-8)
  })

  test('parked right offset rotates with the recalled frame and panel still faces the eyes', () => {
    const anchor = new Group()
    const workspace = new Group()
    const panel = new Group()
    anchor.add(workspace)
    workspace.add(panel)
    const layout = new WorkspaceLayout()
    layout.recall(new Vector3(0, -0.1, -1.05), true)
    layout.dragTo(new Vector3(0.7, 0.2, 0))
    settle(layout)
    for (const point of [new Vector3(-1.05, -0.38, 0), new Vector3(0, -0.38, 1.05)]) {
      layout.recall(point)
      settle(layout)
      layout.apply(workspace, panel, new Vector3())
      expect(panel.position.distanceTo(new Vector3(0.7, 0.2, 0))).toBeLessThan(1e-8)
      const panelWorld = panel.getWorldPosition(new Vector3())
      const right = new Vector3(1, 0, 0).applyQuaternion(workspace.quaternion)
      const offsetWorld = panelWorld.clone().sub(workspace.position)
      expect(offsetWorld.dot(right)).toBeCloseTo(0.7)
      const front = new Vector3(0, 0, 1).applyQuaternion(panel.getWorldQuaternion(new Quaternion()))
      expect(front.dot(panelWorld.negate().normalize())).toBeCloseTo(1)
    }
  })

  test('walking, rig turning, mode changes and host scale preserve child offset and size', () => {
    const host = new Group()
    host.scale.set(2, 3, 4)
    host.rotation.set(0.1, 0.6, 0)
    const anchor = new Group()
    const workspace = new Group()
    const panel = new Group()
    host.add(anchor)
    anchor.add(workspace)
    workspace.add(panel)
    const follow = new WorkspaceAnchor()
    const layout = new WorkspaceLayout()
    layout.recall(new Vector3(0, -0.1, -1.05), true)
    layout.dragTo(new Vector3(0.6, 0.1, 0))
    settle(layout)
    for (const eye of [new Vector3(0, 6, 8), new Vector3(0.5, 1.6, 1), new Vector3(1, 1.6, 1)]) {
      follow.update(eye, new Vector3(-1, 0, 0))
      follow.apply(anchor)
      layout.apply(workspace, panel, eye)
      expect(panel.position.distanceTo(new Vector3(0.6, 0.1, 0))).toBeLessThan(1e-8)
      expect(panel.getWorldScale(new Vector3()).distanceTo(new Vector3(1, 1, 1))).toBeLessThan(1e-8)
      expect(panel.getWorldPosition(new Vector3()).distanceTo(eye)).toBeCloseTo(Math.hypot(0.6, 1.05))
    }
  })

  test('only explicit reset or a new session clears the offset', () => {
    const layout = new WorkspaceLayout()
    layout.recall(new Vector3(0, -0.1, -1.05), true)
    layout.dragTo(new Vector3(0.8, 0.2, 0))
    settle(layout)
    layout.resetPanelPosition()
    settle(layout)
    expect(layout.panelOffset.length()).toBeLessThan(1e-8)
    expect(layout.position.z).toBeCloseTo(-1.05)
    layout.dragTo(new Vector3(-0.6, -0.3, 0.1))
    settle(layout)
    layout.recall(new Vector3(1.05, -0.1, 0), true)
    expect(layout.panelOffset.length()).toBe(0)
  })

  test('grabbing during a recall stops group movement without jumping the panel', () => {
    const layout = new WorkspaceLayout()
    layout.recall(new Vector3(0, -0.1, -1.05), true)
    layout.recall(new Vector3(1.05, -0.38, 0))
    layout.update(0.05, 7)
    const before = layout.position.clone()
    layout.startDrag()
    layout.dragTo(new Vector3(0.4, 0, 0))
    settle(layout)
    expect(layout.position.distanceTo(before)).toBeLessThan(1e-8)
    expect(layout.panelOffset.x).toBeCloseTo(0.4)
  })
})

describe('unrestricted panel dragging', () => {
  test('repeated drags change panel depth without moving the rotated recall group', () => {
    const anchor = new Group()
    const workspace = new Group()
    const panel = new Group()
    anchor.add(workspace)
    workspace.add(panel)
    const layout = new WorkspaceLayout()
    const follow = new WorkspaceAnchor()
    const eye = new Vector3(4, 1.6, 7)
    follow.update(eye, new Vector3(-1, 0, 0))
    follow.apply(anchor)
    layout.recall(new Vector3(-1.05, -0.1, 0), true)
    layout.apply(workspace, panel, eye)
    const groupPosition = layout.position.clone()
    const localEye = workspace.worldToLocal(eye.clone())
    const drag = new WorkspaceDrag()
    for (const direction of [new Vector3(1, 0.5, -1), new Vector3(-1, -0.7, 1), new Vector3(0, 1, 0)]) {
      const grab = panel.position.clone().add(new Vector3(0, -0.3, 0))
      expect(drag.start(1, grab, panel.position)).toBe(true)
      layout.startDrag()
      const target = new Vector3()
      for (const distance of [0.01, 100]) {
        const point = direction.clone().multiplyScalar(distance).add(localEye).add(new Vector3(0, -0.3, 0))
        expect(drag.move(1, point, target)).toBe(true)
        expect(target.distanceTo(localEye)).toBeCloseTo(direction.length() * distance, 8)
        layout.dragTo(target)
        for (let frame = 0; frame < 240; frame++) {
          layout.update(1 / 90, 24)
          layout.apply(workspace, panel, eye, 1 / 90)
          expect(layout.position.distanceTo(groupPosition)).toBeLessThan(1e-8)
        }
        expect(panel.getWorldPosition(new Vector3()).distanceTo(eye)).toBeCloseTo(direction.length() * distance, 8)
      }
      drag.end(1)
    }
  })

  test('pulling the handle closer follows a straight path and retains the released depth', () => {
    const layout = new WorkspaceLayout()
    layout.recall(new Vector3(0, -0.1, -1.05), true)
    const drag = new WorkspaceDrag()
    const handle = new Vector3(0, -0.4, 0)
    expect(drag.start(1, handle, layout.panelOffset)).toBe(true)
    layout.startDrag()
    const target = new Vector3()
    // A captured XR ray hit translates with the hand when its direction is fixed.
    expect(drag.move(1, handle.clone().add(new Vector3(0, 0, 0.8)), target)).toBe(true)
    layout.dragTo(target)
    drag.end(1)
    let previousDepth = 0
    for (let frame = 0; frame < 120; frame++) {
      layout.update(1 / 90, 24)
      expect(layout.panelOffset.x).toBe(0)
      expect(layout.panelOffset.y).toBe(0)
      expect(layout.panelOffset.z).toBeGreaterThanOrEqual(previousDepth)
      expect(layout.panelOffset.z).toBeLessThanOrEqual(0.8)
      previousDepth = layout.panelOffset.z
    }
    expect(layout.position.distanceTo(new Vector3(0, -0.1, -1.05))).toBeLessThan(1e-8)
    expect(layout.panelOffset.z).toBeCloseTo(0.8)
    expect(layout.position.clone().add(layout.panelOffset).z).toBeCloseTo(-0.25)
  })

  test('invalid tracking cannot capture or move the panel', () => {
    const drag = new WorkspaceDrag()
    expect(drag.start(1, new Vector3(), new Vector3(NaN, 0, -1))).toBe(false)
    expect(drag.pointerId).toBeNull()
    expect(drag.start(1, new Vector3(), new Vector3(0, 0, -1.05))).toBe(true)
    expect(drag.move(1, new Vector3(Infinity, 0, 0), new Vector3())).toBe(false)
  })
})


describe('fixed side-panel fold', () => {
  test('both side-panel widths preserve the edge gap through resizing and workspace movement', () => {
    const workspace = new Group()
    const panel = new Group()
    const content = new Group()
    const details = new Group()
    details.name = 'xr-build-details'
    workspace.add(panel)
    panel.add(content)
    content.add(details)
    const layout = new WorkspaceLayout()
    layout.recall(new Vector3(0, -0.1, -1.05), true)
    for (const width of [1.12, 1.4]) {
      const pose = sidePanelPose(width)
      details.position.fromArray(pose.position)
      details.rotation.set(...pose.rotation)
      const fixedRotation = details.quaternion.clone()
      for (const scale of [0.65, 1, 1.6]) {
        content.scale.setScalar(0.62 * scale)
        for (const offset of [new Vector3(), new Vector3(0.3, -0.5, 0.7), new Vector3(-0.3, 0.6, -1)]) {
          layout.panelOffset.copy(offset)
          layout.apply(workspace, panel, new Vector3(), 1 / 90)
          expect(details.quaternion.angleTo(fixedRotation)).toBeCloseTo(0)
          for (const y of [-0.52, 0, 0.52]) {
            const mainEdge = content.localToWorld(new Vector3(0.7, y, 0))
            const sideEdge = details.localToWorld(new Vector3(-width / 2, y, 0))
            expect(mainEdge.distanceTo(sideEdge)).toBeCloseTo(0.06 * 0.62 * scale)
          }
          const sideUp = new Vector3(0, 1, 0).transformDirection(details.matrixWorld)
          const mainUp = new Vector3(0, 1, 0).transformDirection(content.matrixWorld)
          expect(sideUp.dot(mainUp)).toBeCloseTo(1)
          expect(details.position.z).toBeGreaterThan(0)
        }
      }
    }
  })
})
