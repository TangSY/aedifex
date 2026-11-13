import { type ParseMeasurementOptions, parseMeasurement } from '../../../lib/measurement-parser'
import type { WallPlanPoint } from './wall-snap-geometry'

export type PreciseWallEnd =
  | { status: 'empty' | 'invalid' | 'needs-direction' }
  | { status: 'ready'; point: WallPlanPoint }

export function preciseWallHeading({
  start,
  end,
}: {
  start: WallPlanPoint
  end: WallPlanPoint
}): string {
  const dx = end[0] - start[0]
  const dz = end[1] - start[1]
  if (Math.hypot(dx, dz) < 1e-9) return ''
  return `${Math.round(((Math.atan2(dz, dx) * 180) / Math.PI + 360) % 360) % 360}°`
}

export function preciseLengthOptions({
  unit,
  metricNotation,
  locale,
}: {
  unit: 'metric' | 'imperial'
  metricNotation: 'meters' | 'millimeters'
  locale: string
}): ParseMeasurementOptions {
  return {
    bareUnit: unit === 'imperial' ? 'in' : metricNotation === 'millimeters' ? 'mm' : 'm',
    system: unit === 'imperial' ? 'imperial' : 'metric',
    locale,
  }
}

/** Resolve length and absolute plan heading without re-snapping an explicitly typed value. */
export function resolvePreciseWallEnd({
  start,
  pointer,
  lengthText,
  angleText,
  lengthOptions,
  step = 0,
}: {
  start: WallPlanPoint
  pointer: WallPlanPoint
  lengthText: string
  angleText: string
  lengthOptions: ParseMeasurementOptions
  step?: number
}): PreciseWallEnd {
  const lengthInput = lengthText.trim()
  const angleInput = angleText.trim()
  if (!lengthInput && !angleInput) return { status: 'empty' }
  const length = lengthInput
    ? parseMeasurement(lengthInput, { kind: 'length', unitId: 'm' }, lengthOptions)
    : null
  const angle = angleInput
    ? parseMeasurement(
        angleInput,
        { kind: 'angle', unitId: 'rad' },
        { bareUnit: 'deg', locale: lengthOptions.locale },
      )
    : null
  if ((lengthInput && (length === null || length <= 0)) || (angleInput && angle === null))
    return { status: 'invalid' }
  const dx = pointer[0] - start[0]
  const dz = pointer[1] - start[1]
  if (angle === null) {
    const magnitude = Math.hypot(dx, dz)
    if (magnitude < 1e-9) return { status: 'needs-direction' }
    return {
      status: 'ready',
      point: [start[0] + (dx * length!) / magnitude, start[1] + (dz * length!) / magnitude],
    }
  }
  const ux = Math.cos(angle)
  const uz = Math.sin(angle)
  let distance = length ?? Math.max(0, dx * ux + dz * uz)
  if (length === null && step > 0) distance = Math.round(distance / step) * step
  return { status: 'ready', point: [start[0] + ux * distance, start[1] + uz * distance] }
}
