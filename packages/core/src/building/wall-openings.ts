import { refuseParamsWithoutScript } from '../agent-operations/add-object'
import { refuse } from '../agent-tools/refusal'
import {
  matchScriptSlotsToLibrary,
  requireMeasured,
  scriptedSize,
  scriptSource,
} from '../lib/geometry-script-node'
import { wallSupportForNodes } from '../lib/opening-floor-datum'
import {
  type AnyNode,
  type AnyNodeId,
  type CompiledGeometryScript,
  DoorNode,
  type GeometryScriptParamValue,
  getScaledDimensions,
  type ItemNode,
  type WallNode,
  WindowNode,
} from '../schema'
import { getCurtainWallConfig } from '../schema/nodes/curtain-wall'
import type { DoorType, WindowType } from '../schema/nodes/opening-types'
import { getWallTop, wallTopMinimumOver, wallTopStationProfile } from '../services/storey'
import { resolveWallExteriorSide } from '../systems/wall/wall-assembly'
import { getWallCurveLength, isCurvedWall } from '../systems/wall/wall-curve'
import { getWallFaceOffsets } from '../systems/wall/wall-frame'
import { wallHasSlopedTop } from '../systems/wall/wall-top'
import { metadataRecord } from '../utils/metadata-record'
import {
  type DoorStyle,
  doorStyleLook,
  getWindowStyleOverrides,
  type WindowStyle,
} from './opening-style-presets'
import { windowTakesStyle } from './window-types'

// The placement rules of wall openings, shared by the editor's door and window tools and by
// every agent surface: what the editor lets a person do by hand is what an agent may do.

type Nodes = Readonly<Record<string, AnyNode>>

/** 1 µm: below any buildable difference, above floating-point noise. */
const TOUCHING = 1e-6

const lengthOf = (wall: Pick<WallNode, 'start' | 'end'>) =>
  Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])

/**
 * Available wall-local Y span for an opening hosted on `wall`: the wall's resolved top (storey
 * plane for plane-bound walls, stored height for explicit ones) minus the wall's elected slab
 * base, the ceiling an opening's top edge must stay under.
 */
export function resolveWallOpeningCeiling(
  wall: WallNode,
  nodes: Readonly<Record<AnyNodeId, AnyNode>>,
  t?: number,
): number {
  const support = wallSupportForNodes(wall, nodes)
  const top =
    t === undefined
      ? wallTopMinimumOver({
          wall,
          levelId: wall.parentId ?? '',
          nodes,
          electedBase: support.elevation,
          from: 0,
          to: getWallCurveLength(wall),
        })
      : getWallTop(wall, wall.parentId ?? '', nodes, support.elevation, t)
  return top - support.elevation
}

export function wallOpeningCeilingOver(
  wall: WallNode,
  nodes: Readonly<Record<AnyNodeId, AnyNode>>,
  left: number,
  right: number,
): number {
  const support = wallSupportForNodes(wall, nodes)
  return (
    wallTopMinimumOver({
      wall,
      levelId: wall.parentId ?? '',
      nodes,
      electedBase: support.elevation,
      from: left,
      to: right,
    }) - support.elevation
  )
}

function openingCentreRange({
  wall,
  nodes,
  width,
  need,
  min,
  max,
  preferred,
}: {
  wall: WallNode
  nodes: Readonly<Record<AnyNodeId, AnyNode>>
  width: number
  need: number
  min: number
  max: number
  preferred: number
}): [number, number] | null {
  if (min > max) return null
  const support = wallSupportForNodes(wall, nodes)
  const profile = wallTopStationProfile({
    wall,
    levelId: wall.parentId ?? '',
    nodes,
    electedBase: support.elevation,
  })
  const stations = [0, ...profile.criticalStations, profile.length]
  const faces = getWallFaceOffsets(wall)
  const heightAt = (station: number) =>
    Math.min(profile.topAt(station, faces.a), profile.topAt(station, faces.b)) - support.elevation
  const spans: Array<[number, number]> = []
  for (let i = 1; i < stations.length; i++) {
    let left = stations[i - 1]!
    let right = stations[i]!
    const leftFits = heightAt(left) >= need
    const rightFits = heightAt(right) >= need
    if (!leftFits && !rightFits) continue
    if (leftFits !== rightFits) {
      let a = left
      let b = right
      for (let step = 0; step < 40; step++) {
        const mid = (a + b) / 2
        if (heightAt(mid) >= need === leftFits) a = mid
        else b = mid
      }
      if (leftFits) right = (a + b) / 2
      else left = (a + b) / 2
    }
    const previous = spans[spans.length - 1]
    if (previous && left <= previous[1] + TOUCHING) previous[1] = right
    else spans.push([left, right])
  }
  const ranges = spans
    .map(([left, right]): [number, number] => [
      Math.max(min, left + width / 2),
      Math.min(max, right - width / 2),
    ])
    .filter(([left, right]) => left <= right + TOUCHING)
  ranges.sort(
    (a, b) =>
      Math.abs(Math.max(a[0], Math.min(a[1], preferred)) - preferred) -
      Math.abs(Math.max(b[0], Math.min(b[1], preferred)) - preferred),
  )
  const best = ranges[0]
  return best ? [best[0], Math.max(best[0], best[1])] : null
}

/** A curtain wall keeps its perimeter frame clear of openings. */
const openingMargin = (wall: WallNode) =>
  wall.wallType === 'curtain' ? getCurtainWallConfig(wall).perimeterWidth : 0

/** A door's centre: slid along the wall to stay on it, standing on the floor. */
export function clampDoorToWall(
  wall: WallNode,
  localX: number,
  width: number,
  height: number,
  nodes?: Readonly<Record<AnyNodeId, AnyNode>>,
): { clampedX: number; clampedY: number; fits?: boolean } {
  const margin = openingMargin(wall)
  const length = getWallCurveLength(wall)
  const min = margin + width / 2
  const max = length - margin - width / 2
  const fit =
    wallHasSlopedTop(wall) && nodes
      ? openingCentreRange({
          wall,
          nodes,
          width,
          need: height + margin,
          min,
          max,
          preferred: localX,
        })
      : ([min, max] as [number, number])
  const [low, high] = fit ?? [min, max]
  const clampedX = Math.max(low, Math.min(high, localX))
  return {
    clampedX,
    clampedY: height / 2,
    ...(wallHasSlopedTop(wall) && nodes ? { fits: fit !== null } : {}),
  }
}

/** A window's centre: slid to stay on the wall, and between the floor and the wall's ceiling. */
export function clampWindowToWall(
  wall: WallNode,
  localX: number,
  localY: number,
  width: number,
  height: number,
  nodes: Readonly<Record<AnyNodeId, AnyNode>>,
): { clampedX: number; clampedY: number; fits?: boolean } {
  const margin = openingMargin(wall)
  const length = getWallCurveLength(wall)
  const min = margin + width / 2
  const max = length - margin - width / 2
  const fit = wallHasSlopedTop(wall)
    ? openingCentreRange({
        wall,
        nodes,
        width,
        need: height + 2 * margin,
        min,
        max,
        preferred: localX,
      })
    : ([min, max] as [number, number])
  const [low, high] = fit ?? [min, max]
  const clampedX = Math.max(low, Math.min(high, localX))
  const ceiling = wallHasSlopedTop(wall)
    ? wallOpeningCeilingOver(wall, nodes, clampedX - width / 2, clampedX + width / 2)
    : resolveWallOpeningCeiling(wall, nodes)
  const clampedY = Math.max(margin + height / 2, Math.min(ceiling - margin - height / 2, localY))
  return { clampedX, clampedY, ...(wallHasSlopedTop(wall) ? { fits: fit !== null } : {}) }
}

/**
 * The first child of the wall (door, window, or wall-mounted item) that a rectangle centred on
 * (`clampedX`, `clampedY`) would overlap. Items store their bottom Y; doors and windows their
 * centre Y.
 */
export function findWallChildOverlap(
  wallId: string,
  nodes: Nodes,
  clampedX: number,
  clampedY: number,
  width: number,
  height: number,
  ignoreId?: string | readonly string[],
): AnyNode | null {
  const wallNode = nodes[wallId] as WallNode | undefined
  if (!wallNode) return null
  const newBottom = clampedY - height / 2
  const newTop = clampedY + height / 2
  const newLeft = clampedX - width / 2
  const newRight = clampedX + width / 2

  for (const childId of Array.isArray(wallNode.children) ? wallNode.children : []) {
    if (typeof ignoreId === 'string' ? childId === ignoreId : ignoreId?.includes(childId)) continue
    const child = nodes[childId]
    if (!child || metadataRecord(child.metadata).isTransient) continue

    let childLeft: number
    let childRight: number
    let childBottom: number
    let childTop: number

    if (child.type === 'item') {
      const item = child as ItemNode
      if (item.asset.attachTo !== 'wall' && item.asset.attachTo !== 'wall-side') continue
      const [w, h] = getScaledDimensions(item)
      childLeft = item.position[0] - w / 2
      childRight = item.position[0] + w / 2
      childBottom = item.position[1]
      childTop = item.position[1] + h
    } else if (child.type === 'window' || child.type === 'door') {
      const opening = child as { position: [number, number, number]; width: number; height: number }
      childLeft = opening.position[0] - opening.width / 2
      childRight = opening.position[0] + opening.width / 2
      childBottom = opening.position[1] - opening.height / 2
      childTop = opening.position[1] + opening.height / 2
    } else {
      continue
    }

    // Edges that meet are not an overlap, even when a decimal position lands them a hair apart.
    if (
      newLeft < childRight - TOUCHING &&
      newRight > childLeft + TOUCHING &&
      newBottom < childTop - TOUCHING &&
      newTop > childBottom + TOUCHING
    )
      return child
  }
  return null
}

/** Whether a placement collides; a missing wall counts as blocked, as in the editor's tools. */
export function hasWallChildOverlap(
  wallId: string,
  nodes: Nodes,
  clampedX: number,
  clampedY: number,
  width: number,
  height: number,
  ignoreId?: string | readonly string[],
): boolean {
  if (!nodes[wallId]) return true
  return findWallChildOverlap(wallId, nodes, clampedX, clampedY, width, height, ignoreId) !== null
}

export type WallOpeningInput = {
  name?: string
  description?: string
  category?: string
  tags?: string[]
  kind: 'door' | 'window'
  wallId?: string
  t?: number
  position?: number
  width?: number
  height?: number
  sillHeight?: number
  hingesSide?: 'left' | 'right'
  /** Defaults to the side opposite the hinges. */
  handleSide?: 'left' | 'right'
  swingDirection?: 'inward' | 'outward'
  /** A door, or a passage with no leaf (a cased opening, an arch), as the editor's door panel. */
  openingKind?: 'door' | 'opening'
  style?: string
  force?: boolean
  openingShape?: 'rectangle' | 'rounded' | 'arch'
  archHeight?: number
  cornerRadius?: number
  doorType?: DoorType
  windowType?: WindowType
  columns?: number
  rows?: number
  /** A compiled script the opening is built from; its bounds set width and height. */
  compiled?: CompiledGeometryScript
  code?: string
  params?: Record<string, GeometryScriptParamValue>
}

const equalRatios = (count: number) => Array.from({ length: count }, () => 1 / count)

/** A window's size when none is given. Its sill is not a number: see `centredWindowSill`. */
export const DEFAULT_WINDOW = { width: 1.5, height: 1.5 } as const

const DEFAULTS = {
  door: { width: 0.9, height: 2.1 },
  window: DEFAULT_WINDOW,
} as const

const metres = (value: number) => `${value.toFixed(2)} m`

/**
 * The sill that centres a window of `height` vertically on the lowest of `walls`, or 0 when it is
 * taller than they are. What a window with no sill given takes, on every agent surface.
 */
export function centredWindowSill(
  walls: readonly WallNode[],
  height: number,
  nodes: Readonly<Record<AnyNodeId, AnyNode>>,
): number {
  const ceiling = Math.min(...walls.map((wall) => resolveWallOpeningCeiling(wall, nodes)))
  return Math.max(0, (ceiling - height) / 2)
}

/**
 * Plan a door or window on a wall with the editor's rules, or refuse with a code: the one
 * operation behind `add_door` / `add_window` on every agent surface. The caller creates
 * `node` under `wallId`.
 */
/**
 * Which way a door on `wall` faces: out, when the wall knows its outside. A door's swing and a
 * garage door's track run behind its facing (a garage door's track once ran on the street), so a door facing out opens and rolls inside, whichever way the wall was drawn. A wall
 * that does not know its outside, or an inside wall, keeps its front.
 */
export function doorFacing(wall: Pick<WallNode, 'frontSide' | 'backSide'>): {
  side?: 'front' | 'back'
  rotation: [number, number, number]
} {
  const outside = resolveWallExteriorSide(wall)
  if (outside === -1) return { side: 'back', rotation: [0, Math.PI, 0] }
  if (outside === 1) return { side: 'front', rotation: [0, 0, 0] }
  return { rotation: [0, 0, 0] }
}

/** The face a door placed by hand takes: out on an outside wall, else the face hovered. */
/**
 * Hinges and handle are both measured from the door's own left, so a handle
 * left where it is would hang on the hinge edge of a right-hinged door.
 */
export function doorHardwareSides(input: Pick<WallOpeningInput, 'hingesSide' | 'handleSide'>) {
  const hingesSide = input.hingesSide ?? 'left'
  return {
    hingesSide,
    handleSide: input.handleSide ?? (hingesSide === 'right' ? 'left' : 'right'),
  } as const
}

export const placedDoorFace = (
  wall: Pick<WallNode, 'frontSide' | 'backSide'>,
  hovered: 'front' | 'back',
): 'front' | 'back' => doorFacing(wall).side ?? hovered

export function planWallOpening(nodes: Nodes, input: WallOpeningInput) {
  refuseParamsWithoutScript(nodes, input)
  const { kind, wallId } = input
  if (!wallId)
    refuse(
      'wall_required',
      `Say which wall the ${kind} goes on (wallId), or pass nodeId to rebuild one.`,
    )
  const host = nodes[wallId]
  if (!host) refuse('wall_not_found', `Wall not found: ${wallId}.`, { wallId })
  if (host.type !== 'wall')
    refuse('not_a_wall', `Node ${wallId} is a ${host.type}, not a wall.`, {
      wallId,
      type: host.type,
    })
  const wall = host as WallNode
  if (isCurvedWall(wall))
    refuse(
      'curved_wall',
      `Wall ${wallId} is curved; doors and windows go on straight walls, as in the editor.`,
      { wallId },
    )

  const { t, position } = input
  if (t !== undefined && position !== undefined && Math.abs(t - position) > 1e-9)
    refuse(
      'conflicting_position',
      `t (${t}) and position (${position}) disagree; they are the same field, pass one.`,
      { t, position },
    )
  const along = t ?? position
  if (along === undefined)
    refuse(
      'position_required',
      'Say where on the wall: t (or position) from 0 at its start to 1 at its end.',
    )

  // The renderer draws a style's panes on a Fixed window only; an operable window draws its own
  // sashes, so a style there would be written and never seen.
  const windowType = input.windowType ?? 'fixed'
  if (kind === 'window' && input.style && !windowTakesStyle(windowType))
    refuse(
      'style_needs_fixed_window',
      `A window style shapes a Fixed window's panes; a ${windowType} window draws its own sashes, so the style would not show. Pass windowType 'fixed' with the style, or drop the style.`,
      { windowType, style: input.style },
    )

  const { compiled } = input
  if (compiled && compiled.mount !== 'wall')
    refuse('wrong_mount', `A ${kind}'s script uses mount 'wall'.`, { mount: compiled.mount })
  if (compiled) requireMeasured(compiled, { label: `A ${kind}`, tool: `add_${kind}` })
  const [scriptedWidth, scriptedHeight] = compiled ? scriptedSize(compiled.manifest) : []
  const width = scriptedWidth ?? input.width ?? DEFAULTS[kind].width
  const height = scriptedHeight ?? input.height ?? DEFAULTS[kind].height
  const wallLength = lengthOf(wall)
  if (wallLength < width)
    refuse(
      'wall_too_short',
      `Wall ${wallId} is ${metres(wallLength)} long, too short for a ${metres(width)} ${kind}.`,
      { wallId, wallLength, width },
    )

  const rawX = along * wallLength
  // A window with no sill given is centred on its wall, taller than the wall or not: the clamp
  // below stands one that is too tall on the floor and reports it clamped.
  const rawY =
    kind === 'door'
      ? height / 2
      : input.sillHeight === undefined
        ? resolveWallOpeningCeiling(wall, nodes as Record<AnyNodeId, AnyNode>) / 2
        : input.sillHeight + height / 2
  const { clampedX, clampedY, fits } =
    kind === 'door'
      ? clampDoorToWall(wall, rawX, width, height, nodes as Record<AnyNodeId, AnyNode>)
      : clampWindowToWall(wall, rawX, rawY, width, height, nodes as Record<AnyNodeId, AnyNode>)
  if (fits === false)
    refuse('wall_too_low', `No part of wall ${wallId} can fit this ${kind} under its sloped top.`, {
      wallId,
      width,
      height,
    })

  if (!input.force) {
    const blocking = findWallChildOverlap(wallId, nodes, clampedX, clampedY, width, height)
    if (blocking) {
      const span =
        blocking.type === 'item'
          ? getScaledDimensions(blocking as ItemNode)[0]
          : (blocking as { width: number }).width
      const center = (blocking as { position: [number, number, number] }).position[0]
      refuse(
        'opening_overlap',
        `A ${metres(width)} ${kind} at ${metres(clampedX)} on wall ${wallId} would overlap ${blocking.type} ${blocking.id} (${metres(center - span / 2)}–${metres(center + span / 2)}). Move it along the wall, or, if the person asked for the overlap, pass force, like holding Alt in the editor.`,
        { wallId, blockingId: blocking.id },
      )
    }
  }

  const levelId = wall.parentId
  const siblings = Object.values(nodes).filter((node) => {
    if (node.type !== kind) return false
    const parent = node.parentId ? nodes[node.parentId] : undefined
    return parent?.parentId === levelId
  }).length
  const base = {
    ...(compiled?.nodeId ? { id: compiled.nodeId } : {}),
    name: input.name ?? `${kind === 'door' ? 'Door' : 'Window'} ${siblings + 1}`,
    position: [clampedX, clampedY, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    wallId,
    parentId: wallId,
    width,
    height,
    ...(input.openingShape ? { openingShape: input.openingShape } : {}),
    ...(input.archHeight === undefined ? {} : { archHeight: Math.min(input.archHeight, height) }),
    ...(input.cornerRadius === undefined ? {} : { cornerRadius: input.cornerRadius }),
    ...(compiled
      ? {
          source: scriptSource(compiled, input),
          slots: matchScriptSlotsToLibrary(compiled.manifest),
        }
      : {}),
  }
  const node =
    kind === 'door'
      ? DoorNode.parse({
          ...base,
          ...doorFacing(wall),
          ...doorHardwareSides(input),
          swingDirection: input.swingDirection ?? 'inward',
          ...(input.style ? doorStyleLook(input.style as DoorStyle) : {}),
          ...(input.doorType ? { doorType: input.doorType } : {}),
          ...(input.openingKind ? { openingKind: input.openingKind } : {}),
        })
      : WindowNode.parse({
          ...base,
          ...getWindowStyleOverrides(input.style as WindowStyle | undefined),
          ...(input.windowType ? { windowType: input.windowType } : {}),
          ...(input.columns ? { columnRatios: equalRatios(input.columns) } : {}),
          ...(input.rows ? { rowRatios: equalRatios(input.rows) } : {}),
        })

  return {
    node,
    wallId,
    localX: clampedX,
    t: along,
    wallLength,
    clamped: Math.abs(clampedX - rawX) > 1e-9 || Math.abs(clampedY - rawY) > 1e-9,
    ...(kind === 'window' ? { sillHeight: clampedY - height / 2 } : {}),
  }
}
