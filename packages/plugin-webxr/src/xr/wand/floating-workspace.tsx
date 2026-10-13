'use client'

import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { isXRInputSourceState, useXR, useXRInputSourceState } from '@react-three/xr'
import { useCallback, useEffect, useRef, useState } from 'react'
import { type Group, Matrix4, type Mesh, Shape, Vector3 } from 'three'
import { useWebXRSceneLayers } from '../layers'
import { isQuestYPressed } from '../controller-buttons'
import { useXRPlayerMode } from '../mode-switching/store/player-mode'
import type { XRWandAdapter } from './adapter'
import { XRWandItemsPanel } from './items-panel'
import { XRWandBuildPanel } from './build-panel'
import { XRWandPaintPanel } from './paint-panel'
import { sidePanelPose, XR_WAND_PANEL_INPUT_NAME } from './panel-layout'
import { useXRWandPanelSettings } from './panel-settings'
import { SettingsInspector, XRWandSettingsPanel } from './settings-panel'
import { SpatialText } from './spatial-text'
import { SpatialLine, shapeLinePoints } from './spatial-line'
import { XR_WAND_THEME } from './theme'
import { PanelIcon } from './panel-icon'
import { PanelFace, SpatialButton } from './spatial-controls'
import {
  WorkspaceAnchor,
  WorkspaceLayout,
  placeWorkspace,
  selectionWorkspacePosition,
  workspaceParentPoint,
  clampWorkspaceDragHeight,
  WORKSPACE_CONTENT_SCALE,
  WorkspaceDrag,
} from './workspace-placement'
import { useXRWorkspace } from './workspace-store'
import { WorkspaceButton } from './workspace-button'
import { WorkspaceHandShortcut } from './workspace-hand-shortcut'
import { WorkspaceResize } from './workspace-resize'
import { WorkspaceResizeHandles } from './workspace-resize-handles'

type PointerDownEvent = ThreeEvent<PointerEvent>
type WorkspaceTab = 'paint' | 'build' | 'items' | 'settings'
const TABS = ['build', 'paint', 'items', 'settings'] as const
// Keep the first control visually aligned with the top of the 1.04 m rail.
const RAIL_TOP = 0.49
const RAIL_ITEM_GAP = 0.03
const RAIL_ITEM_HEIGHT = 0.105
const DRAG_AREA_Y = -0.585
const DRAG_BAR_RADIUS = 0.014
const DRAG_BAR_LENGTH = 0.44
const DRAG_BAR_OUTLINE = shapeLinePoints(
  new Shape()
    .absarc(DRAG_BAR_LENGTH / 2, 0, DRAG_BAR_RADIUS, -Math.PI / 2, Math.PI / 2, false)
    .absarc(-DRAG_BAR_LENGTH / 2, 0, DRAG_BAR_RADIUS, Math.PI / 2, Math.PI * 1.5, false)
    .closePath(),
)

function RailButton({
  iconSrc,
  name,
  y,
  selected,
  onClick,
}: {
  iconSrc: string
  name: string
  y: number
  selected?: boolean
  onClick: () => void
}) {
  return (
    <SpatialButton
      name={name}
      onClick={onClick}
      position={[0, y, 0]}
      selected={selected}
      size={[0.115, 0.105]}
    >
      <PanelIcon muted={!selected} positionY={0} size={0.066} src={iconSrc} />
    </SpatialButton>
  )
}

export function XRFloatingWorkspace({ adapter }: { adapter: XRWandAdapter }) {
  const anchor = useRef<Group>(null)
  const follow = useRef(new WorkspaceAnchor())
  const workspace = useRef<Group>(null)
  const layout = useRef(new WorkspaceLayout())
  const handledReset = useRef(-1)
  const root = useRef<Group>(null)
  const activeHandle = useRef<Mesh | null>(null)
  const resize = useRef(new WorkspaceResize())
  const [resizeHandle, setResizeHandle] = useState<string | null>(null)
  const session = useXR((state) => state.session)
  const referenceSpace = useXR((state) => state.originReferenceSpace)
  const origin = useXR((state) => state.origin)
  const playerMode = useXRPlayerMode((state) => state.mode)
  const controller = useXRInputSourceState('controller', 'left')
  const { overlay } = useWebXRSceneLayers()
  const panelScale = useXRWandPanelSettings((state) => state.panelScale)
  const handledRecall = useRef(-1)
  const recallButton = useRef(new WorkspaceButton())
  const previousMode = useRef(playerMode)
  const visible = useXRWorkspace((state) => state.visible)
  const drag = useRef(new WorkspaceDrag())
  const dragBarVisual = useRef<Group>(null)
  const dragBarHovered = useRef(false)
  const dragSource = useRef<XRInputSource | null>(null)
  const eye = useRef(new Vector3())
  const viewerMatrix = useRef(new Matrix4())
  const viewerTracked = useRef(false)
  const direction = useRef(new Vector3())
  const rigDirection = useRef(new Vector3())
  const movingToSelection = useRef(false)
  const target = useRef(new Vector3())
  const localPoint = useRef(new Vector3())
  const [tab, setTab] = useState<WorkspaceTab>('build')
  const selectionSettings = adapter.useSettingsModel({ scope: 'selection', unpaged: true })
  const hasSelection = selectionSettings.contextual === true && !!selectionSettings.onClearSelection

  const endDrag = useCallback(() => {
    const pointerId = drag.current.pointerId ?? resize.current.pointerId
    if (pointerId === null) return
    drag.current.end(pointerId)
    resize.current.end(pointerId)
    activeHandle.current?.releasePointerCapture?.(pointerId)
    activeHandle.current = null
    setResizeHandle(null)
    dragSource.current = null
    if (root.current) root.current.userData.dragging = false
  }, [])

  useEffect(() => useXRPlayerMode.subscribe((state) => {
    if (state.inputLocked) endDrag()
  }), [endDrag])

  useEffect(() => {
    endDrag()
    if (previousMode.current !== playerMode) {
      previousMode.current = playerMode
      useXRWorkspace.getState().modeChanged()
    }
  }, [endDrag, playerMode])

  useEffect(() => {
    if (!visible) {
      dragBarHovered.current = false
      endDrag()
    }
  }, [endDrag, visible])

  useEffect(() => {
    handledRecall.current = -1
    dragBarHovered.current = false
    viewerTracked.current = false
    recallButton.current.reset()
    if (session) useXRWorkspace.getState().recall()
    const endSelection = (event: XRInputSourceEvent) => {
      if (event.inputSource === dragSource.current) endDrag()
    }
    const visibilityChanged = () => {
      if (session?.visibilityState !== 'visible') {
        endDrag()
        recallButton.current.reset()
      }
    }
    session?.addEventListener('selectend', endSelection)
    session?.addEventListener('end', endDrag)
    session?.addEventListener('visibilitychange', visibilityChanged)
    return () => {
      session?.removeEventListener('selectend', endSelection)
      session?.removeEventListener('end', endDrag)
      session?.removeEventListener('visibilitychange', visibilityChanged)
      endDrag()
    }
  }, [endDrag, session])

  useFrame((_, delta, frame) => {
    if (dragBarVisual.current) {
      const highlighted = visible && (dragBarHovered.current || drag.current.pointerId !== null)
      const targetScale = highlighted ? 1.08 : 1
      const currentScale = dragBarVisual.current.scale.x
      dragBarVisual.current.scale.setScalar(
        currentScale + (targetScale - currentScale) * (1 - Math.exp(-20 * delta)),
      )
    }
    const group = root.current
    if (!group || !workspace.current || !anchor.current || !session) return
    // The host renderer reparents its stereo camera during rendering. Read the
    // XR viewer pose directly so event handlers never apply the origin twice.
    const pose = frame && referenceSpace && frame.getViewerPose(referenceSpace)
    viewerTracked.current = !!pose && !!origin
    if (!pose || !origin) {
      endDrag()
      recallButton.current.reset()
      return
    }
    origin.updateWorldMatrix(true, false)
    viewerMatrix.current.fromArray(pose.transform.matrix).premultiply(origin.matrixWorld)
    eye.current.setFromMatrixPosition(viewerMatrix.current)
    direction.current.set(0, 0, -1).transformDirection(viewerMatrix.current)
    if (useXRPlayerMode.getState().inputLocked || !controller || session.visibilityState !== 'visible' ||
      (frame && referenceSpace && !frame.getPose(controller.inputSource.targetRaySpace, referenceSpace))) {
      recallButton.current.reset()
    } else {
      const action = recallButton.current.update(isQuestYPressed(controller), delta)
      if (action === 'toggle') useXRWorkspace.getState().toggle()
      if (action === 'rescue') useXRWorkspace.getState().recall()
    }

    const activePointer = drag.current.pointerId ?? resize.current.pointerId
    if (activePointer !== null && !activeHandle.current?.hasPointerCapture?.(activePointer)) endDrag()

    const source = dragSource.current
    if (
      activePointer !== null &&
      source &&
      (!session ||
        !Array.from(session.inputSources).includes(source) ||
        (frame && referenceSpace && !frame.getPose(source.targetRaySpace, referenceSpace)))
    )
      endDrag()

    // Read the store here so controller recall and pointer recall share one path.
    const { recallRequest: request, recallReason, resetPositionRequest, visible: isVisible } = useXRWorkspace.getState()
    group.visible = isVisible
    group.pointerEvents = isVisible ? 'auto' : 'none'
    if (!isVisible) endDrag()
    const initial = handledRecall.current === -1
    const recalled = handledRecall.current !== request &&
      ((drag.current.pointerId === null && resize.current.pointerId === null) || recallReason === 'manual')
    if (recalled) endDrag()
    rigDirection.current.set(0, 0, -1).transformDirection(origin.matrixWorld)
    follow.current.update(eye.current, rigDirection.current)
    follow.current.apply(anchor.current)
    if (recalled) {
      const selection = !initial && recallReason === 'selection'
      const placement = selection ? selectionWorkspacePosition : placeWorkspace
      placement(eye.current, direction.current, target.current)
      workspaceParentPoint(workspace.current, target.current, target.current)
      layout.current.recall(target.current, initial || recallReason === 'manual')
      movingToSelection.current = selection
      handledRecall.current = request
    }
    if (handledReset.current !== resetPositionRequest) {
      if (!initial) {
        endDrag()
        layout.current.resetPanelPosition()
      }
      handledReset.current = resetPositionRequest
    }
    // Keep the resize plane and center stable while a corner owns the pointer.
    if (resize.current.pointerId !== null) return
    layout.current.update(delta, movingToSelection.current ? 7 : 24)
    layout.current.apply(workspace.current, group, eye.current,
      initial || (recalled && recallReason === 'manual') ? undefined : delta)
  })

  const startDrag = (event: PointerDownEvent) => {
    event.stopPropagation()
    if (useXRPlayerMode.getState().inputLocked) return
    if (resize.current.pointerId !== null) return
    if (!root.current || !viewerTracked.current || !useXRWorkspace.getState().visible) return
    if (
      !drag.current.start(
        event.pointerId,
        workspaceParentPoint(root.current, event.point, localPoint.current),
        root.current.position,
      )
    )
      return
    movingToSelection.current = false
    layout.current.startDrag()
    activeHandle.current = event.object as Mesh
    event.object.setPointerCapture?.(event.pointerId)
    root.current.userData.dragging = true
    if ('pointerState' in event && isXRInputSourceState(event.pointerState)) {
      dragSource.current = event.pointerState.inputSource
    }
  }

  const moveDrag = (event: PointerDownEvent) => {
    event.stopPropagation()
    if (useXRPlayerMode.getState().inputLocked) { endDrag(); return }
    if (!root.current || !viewerTracked.current || !useXRWorkspace.getState().visible) return
    workspaceParentPoint(root.current, event.point, localPoint.current)
    if (drag.current.move(event.pointerId, localPoint.current, target.current)) {
      clampWorkspaceDragHeight(root.current, target.current, eye.current)
      layout.current.dragTo(target.current)
    }
  }

  const finishDrag = (event: PointerDownEvent) => {
    event.stopPropagation()
    if ((drag.current.pointerId ?? resize.current.pointerId) === event.pointerId) endDrag()
  }

  const startResize = (event: PointerDownEvent) => {
    event.stopPropagation()
    if (useXRPlayerMode.getState().inputLocked) return
    const group = root.current
    if (!group || !viewerTracked.current || !useXRWorkspace.getState().visible || drag.current.pointerId !== null) return
    group.updateWorldMatrix(true, false)
    if (!resize.current.start(event.pointerId, event.point, group.matrixWorld,
      useXRWandPanelSettings.getState().panelScale)) return
    layout.current.startDrag()
    movingToSelection.current = false
    activeHandle.current = event.object as Mesh
    event.object.setPointerCapture?.(event.pointerId)
    group.userData.dragging = true
    setResizeHandle(event.object.name)
    if ('pointerState' in event && isXRInputSourceState(event.pointerState)) {
      dragSource.current = event.pointerState.inputSource
    }
  }

  const moveResize = (event: PointerDownEvent) => {
    event.stopPropagation()
    if (useXRPlayerMode.getState().inputLocked) { endDrag(); return }
    if (!viewerTracked.current || !useXRWorkspace.getState().visible) return
    const scale = resize.current.move(event.pointerId, event.point)
    if (scale !== undefined) useXRWandPanelSettings.getState().setPanelScale(scale)
  }

  return (
    <>
      <WorkspaceHandShortcut />
      <group ref={anchor} name="xr-player-ui-anchor">
        <group ref={workspace} name="xr-workspace-recall-group">
          <group
            ref={root}
            name={XR_WAND_PANEL_INPUT_NAME}
            visible={visible}
            pointerEvents={visible ? 'auto' : 'none'}
            pointerEventsOrder={100}
            pointerEventsType={(pointerId, pointerType) =>
              pointerType !== 'grab' &&
              ((drag.current.pointerId ?? resize.current.pointerId) === null ||
                (drag.current.pointerId ?? resize.current.pointerId) === pointerId)
            }
          >
            <group scale={WORKSPACE_CONTENT_SCALE * panelScale}>
              <WorkspaceResizeHandles
                active={resizeHandle}
                onStart={startResize}
                onMove={moveResize}
                onEnd={finishDrag}
              />
              <group name="xr-workspace-content">
                <PanelFace width={1.4} height={1.04} />
                {tab === 'paint' && <XRWandPaintPanel adapter={adapter} />}
                {tab === 'build' && <XRWandBuildPanel adapter={adapter} separateItems={!!adapter.useItemsModel} hideDetails={hasSelection} />}
                {tab === 'items' && adapter.useItemsModel && <XRWandItemsPanel useItemsModel={adapter.useItemsModel} />}
                {tab === 'settings' && <XRWandSettingsPanel adapter={adapter} panelPlacement workspaceOnly />}
              </group>
              {hasSelection && (
                <group name="xr-workspace-selection-settings" {...sidePanelPose(1.4)}>
                  <PanelFace width={1.4} height={1.04} />
                  <SettingsInspector
                    key={selectionSettings.contextKey}
                    model={selectionSettings}
                  />
                </group>
              )}
              <group name="xr-workspace-tool-rail" position={[-0.8, 0, 0]}>
                <PanelFace width={0.16} height={1.04} />
                {TABS.filter((value) => value !== 'items' || adapter.useItemsModel).map((value, index) => (
                  <RailButton
                    key={value}
                    iconSrc={`/icons/${value === 'items' ? 'couch' : value}.webp`}
                    name={`xr-workspace-tab-${value}`}
                    y={RAIL_TOP - RAIL_ITEM_HEIGHT / 2 - index * (RAIL_ITEM_HEIGHT + RAIL_ITEM_GAP)}
                    selected={tab === value}
                    onClick={() => setTab(value)}
                  />
                ))}
                <SpatialButton
                  name="xr-workspace-hide"
                  position={[0, -0.3025, 0]}
                  size={[0.115, RAIL_ITEM_HEIGHT]}
                  onClick={() => useXRWorkspace.getState().hide()}
                >
                  <SpatialLine color={XR_WAND_THEME.muted} points={[
                    [-0.024, 0.034, 0.012], [0.024, 0.034, 0.012],
                    [0.024, 0.002, 0.012], [-0.024, 0.002, 0.012], [-0.024, 0.034, 0.012],
                  ]} />
                  <SpatialLine color={XR_WAND_THEME.text} points={[
                    [-0.012, 0.018, 0.013], [0.012, 0.018, 0.013],
                  ]} />
                  <SpatialText color={XR_WAND_THEME.muted} fontSize={0.018} maxWidth={0.105} position={[0, -0.025, 0.012]}>
                    Hide
                  </SpatialText>
                </SpatialButton>
                <SpatialButton
                  name="xr-workspace-recenter"
                  position={[0, -0.4375, 0]}
                  size={[0.115, RAIL_ITEM_HEIGHT]}
                  onClick={() => useXRWorkspace.getState().recall()}
                >
                  <SpatialLine color={XR_WAND_THEME.muted} points={[
                    [-0.025, 0.034, 0.012], [-0.009, 0.018, 0.012],
                    [-0.009, 0.033, 0.012], [-0.009, 0.018, 0.012], [-0.024, 0.018, 0.012],
                  ]} />
                  <SpatialLine color={XR_WAND_THEME.muted} points={[
                    [0.025, 0.002, 0.012], [0.009, 0.018, 0.012],
                    [0.009, 0.003, 0.012], [0.009, 0.018, 0.012], [0.024, 0.018, 0.012],
                  ]} />
                  <SpatialText color={XR_WAND_THEME.muted} fontSize={0.018} maxWidth={0.105} position={[0, -0.025, 0.012]}>
                    Bring here
                  </SpatialText>
                </SpatialButton>
              </group>
              <mesh
                name="xr-workspace-drag-handle"
                layers={overlay}
                position={[-0.09, DRAG_AREA_Y, 0]}
                onPointerEnter={() => { dragBarHovered.current = true }}
                onPointerLeave={() => { dragBarHovered.current = false }}
                onPointerDown={startDrag}
                onPointerMove={moveDrag}
                onPointerUp={finishDrag}
                onPointerCancel={finishDrag}
                onClick={(event) => event.stopPropagation()}
              >
                <planeGeometry args={[0.52, 0.11]} />
                <meshBasicMaterial depthWrite={false} opacity={0} transparent />
                <group ref={dragBarVisual}>
                  <mesh rotation={[0, 0, Math.PI / 2]} raycast={() => null}>
                    <capsuleGeometry args={[DRAG_BAR_RADIUS, DRAG_BAR_LENGTH, 6, 16]} />
                    <meshBasicMaterial color={XR_WAND_THEME.surface} toneMapped={false} />
                  </mesh>
                  <group position={[0, 0, DRAG_BAR_RADIUS]}>
                    <SpatialLine
                      color={XR_WAND_THEME.border}
                      lineWidth={1.4}
                      opacity={0.9}
                      points={DRAG_BAR_OUTLINE}
                    />
                  </group>
                </group>
              </mesh>
            </group>
          </group>
        </group>
      </group>
    </>
  )
}
