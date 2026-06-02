import {
  type AnyNodeId,
  normalizeWallCurveOffset,
  useScene,
} from '@aedifex/core'
import type {
  AddCutOutToolCall,
  AddFenceToolCall,
  UpdateFenceToolCall,
  ValidatedAddCutOut,
  ValidatedAddFence,
  ValidatedUpdateFence,
} from '../types'
import { polygonArea } from './validate-structure'
import { resolveEffectiveLevelId } from './spatial-queries'

// ============================================================================
// Fence & Cut-Out Validators
// ============================================================================

const VALID_FENCE_STYLES = new Set(['slat', 'rail', 'privacy'])
const VALID_BASE_STYLES = new Set(['floating', 'grounded'])

export function validateAddFence(call: AddFenceToolCall): ValidatedAddFence {
  const effectiveLevel = resolveEffectiveLevelId(call.levelId)

  const start = call.start as [number, number]
  const end = call.end as [number, number]

  if (!start || !end || start.length !== 2 || end.length !== 2) {
    return {
      type: 'add_fence',
      status: 'invalid',
      start: start ?? [0, 0],
      end: end ?? [0, 0],
      height: call.height ?? 1.8,
      thickness: call.thickness ?? 0.08,
      style: call.style ?? 'slat',
      baseStyle: call.baseStyle ?? 'grounded',
      color: call.color ?? '#ffffff',
      postSpacing: call.postSpacing ?? 2,
      errorReason: 'Fence requires valid start [x, z] and end [x, z] points.',
    }
  }

  // Check minimum length
  const dx = end[0] - start[0]
  const dz = end[1] - start[1]
  const length = Math.sqrt(dx * dx + dz * dz)
  if (length < 0.3) {
    return {
      type: 'add_fence',
      status: 'invalid',
      start,
      end,
      height: call.height ?? 1.8,
      thickness: call.thickness ?? 0.08,
      style: call.style ?? 'slat',
      baseStyle: call.baseStyle ?? 'grounded',
      color: call.color ?? '#ffffff',
      postSpacing: call.postSpacing ?? 2,
      errorReason: `Fence length ${length.toFixed(2)}m is too short. Minimum is 0.3m.`,
    }
  }

  const style = call.style ?? 'slat'
  if (!VALID_FENCE_STYLES.has(style)) {
    return {
      type: 'add_fence',
      status: 'invalid',
      start,
      end,
      height: call.height ?? 1.8,
      thickness: call.thickness ?? 0.08,
      style: 'slat',
      baseStyle: call.baseStyle ?? 'grounded',
      color: call.color ?? '#ffffff',
      postSpacing: call.postSpacing ?? 2,
      errorReason: `Invalid fence style "${style}". Must be one of: slat, rail, privacy.`,
    }
  }

  const baseStyle = call.baseStyle ?? 'grounded'
  if (!VALID_BASE_STYLES.has(baseStyle)) {
    return {
      type: 'add_fence',
      status: 'invalid',
      start,
      end,
      height: call.height ?? 1.8,
      thickness: call.thickness ?? 0.08,
      style,
      baseStyle: 'grounded',
      color: call.color ?? '#ffffff',
      postSpacing: call.postSpacing ?? 2,
      errorReason: `Invalid baseStyle "${baseStyle}". Must be one of: floating, grounded.`,
    }
  }

  const height = call.height ?? 1.8
  if (height < 0.3 || height > 5.0) {
    return {
      type: 'add_fence',
      status: 'invalid',
      start,
      end,
      height,
      thickness: call.thickness ?? 0.08,
      style,
      baseStyle,
      color: call.color ?? '#ffffff',
      postSpacing: call.postSpacing ?? 2,
      errorReason: `Fence height ${height}m is out of range. Must be 0.3-5.0m.`,
    }
  }

  // Fences reuse wall-curve geometry helpers, so the same chord/2 cap applies.
  // Clamp here so the LLM sees the adjustment instead of a silent renderer clamp.
  let finalCurveOffset = call.curveOffset
  let curveAdjustment: string | undefined
  if (call.curveOffset !== undefined) {
    const clamped = normalizeWallCurveOffset({ start, end }, call.curveOffset)
    if (clamped !== call.curveOffset) {
      finalCurveOffset = clamped
      curveAdjustment = `curveOffset clamped from ${call.curveOffset} to ${clamped} (max = chord length / 2 ≈ ${(length / 2).toFixed(2)}m).`
    }
  }

  return {
    type: 'add_fence',
    status: curveAdjustment ? 'adjusted' : 'valid',
    start,
    end,
    height,
    thickness: call.thickness ?? 0.08,
    style: style as 'slat' | 'rail' | 'privacy',
    baseStyle: baseStyle as 'floating' | 'grounded',
    color: call.color ?? '#ffffff',
    postSpacing: call.postSpacing ?? 2,
    curveOffset: finalCurveOffset,
    levelId: effectiveLevel ?? undefined,
    adjustmentReason: curveAdjustment,
  }
}

export function validateUpdateFence(call: UpdateFenceToolCall): ValidatedUpdateFence {
  const { nodes } = useScene.getState()
  const node = nodes[call.nodeId as AnyNodeId]

  if (!node) {
    return { type: 'update_fence', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: `Fence "${call.nodeId}" not found.` }
  }
  if (node.type !== 'fence') {
    return { type: 'update_fence', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: `Node "${call.nodeId}" is a ${node.type}, not a fence.` }
  }

  if (call.style && !VALID_FENCE_STYLES.has(call.style)) {
    return { type: 'update_fence', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: `Invalid fence style "${call.style}".` }
  }

  if (call.baseStyle && !VALID_BASE_STYLES.has(call.baseStyle)) {
    return { type: 'update_fence', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: `Invalid baseStyle "${call.baseStyle}".` }
  }

  if (call.height !== undefined && (call.height < 0.3 || call.height > 5.0)) {
    return { type: 'update_fence', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: `Fence height ${call.height}m is out of range. Must be 0.3-5.0m.` }
  }

  // Check new length if start/end are being updated
  if (call.start && call.end) {
    const dx = call.end[0] - call.start[0]
    const dz = call.end[1] - call.start[1]
    const length = Math.sqrt(dx * dx + dz * dz)
    if (length < 0.3) {
      return { type: 'update_fence', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: `Fence length ${length.toFixed(2)}m is too short. Minimum is 0.3m.` }
    }
  }

  // Clamp curveOffset against the resulting (possibly updated) chord.
  let finalCurveOffset = call.curveOffset
  let curveAdjustment: string | undefined
  if (call.curveOffset !== undefined) {
    const fence = node as { start: [number, number]; end: [number, number] }
    const effStart = call.start ?? fence.start
    const effEnd = call.end ?? fence.end
    const clamped = normalizeWallCurveOffset({ start: effStart, end: effEnd }, call.curveOffset)
    if (clamped !== call.curveOffset) {
      finalCurveOffset = clamped
      const chord = Math.hypot(effEnd[0] - effStart[0], effEnd[1] - effStart[1])
      curveAdjustment = `curveOffset clamped from ${call.curveOffset} to ${clamped} (max = chord length / 2 ≈ ${(chord / 2).toFixed(2)}m).`
    }
  }

  return {
    type: 'update_fence',
    status: curveAdjustment ? 'adjusted' : 'valid',
    nodeId: call.nodeId as AnyNodeId,
    start: call.start,
    end: call.end,
    height: call.height,
    thickness: call.thickness,
    style: call.style,
    baseStyle: call.baseStyle,
    color: call.color,
    postSpacing: call.postSpacing,
    curveOffset: finalCurveOffset,
    adjustmentReason: curveAdjustment,
  }
}

export function validateAddCutOut(call: AddCutOutToolCall): ValidatedAddCutOut {
  const { nodes } = useScene.getState()
  const node = nodes[call.nodeId as AnyNodeId]

  if (!node) {
    return { type: 'add_cut_out', status: 'invalid', nodeId: call.nodeId as AnyNodeId, hole: [], errorReason: `Node "${call.nodeId}" not found.` }
  }

  if (node.type !== 'slab' && node.type !== 'ceiling') {
    return { type: 'add_cut_out', status: 'invalid', nodeId: call.nodeId as AnyNodeId, hole: [], errorReason: `Node "${call.nodeId}" is a ${node.type}. Cut-outs can only be added to slabs or ceilings.` }
  }

  const hole = call.hole as [number, number][]
  if (!hole || hole.length < 3) {
    return { type: 'add_cut_out', status: 'invalid', nodeId: call.nodeId as AnyNodeId, hole: hole ?? [], errorReason: 'Cut-out hole polygon must have at least 3 points.' }
  }

  const holeArea = polygonArea(hole)
  if (holeArea < 0.1) {
    return { type: 'add_cut_out', status: 'invalid', nodeId: call.nodeId as AnyNodeId, hole, errorReason: `Cut-out area too small (${holeArea.toFixed(2)}m²). Minimum is 0.1m².` }
  }

  // Check that hole area doesn't exceed parent polygon area
  const parentPolygon = (node as { polygon?: [number, number][] }).polygon
  if (parentPolygon) {
    const parentArea = polygonArea(parentPolygon)
    if (holeArea > parentArea * 0.9) {
      return { type: 'add_cut_out', status: 'invalid', nodeId: call.nodeId as AnyNodeId, hole, errorReason: `Cut-out area (${holeArea.toFixed(1)}m²) is too large relative to the ${node.type} area (${parentArea.toFixed(1)}m²). Maximum is 90% of parent area.` }
    }
  }

  return {
    type: 'add_cut_out',
    status: 'valid',
    nodeId: call.nodeId as AnyNodeId,
    hole,
  }
}
