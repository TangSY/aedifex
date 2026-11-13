import { isTypingTarget } from '../../lib/typing-target'
import { routePreciseKey, usePrecisePlacement } from '../../store/use-precise-placement'
import { preciseLengthOptions, resolvePreciseWallEnd } from '../tools/wall/precise-wall-end'
import {
  getSegmentGridStep,
  isSegmentLongEnough,
  type WallPlanPoint,
} from '../tools/wall/wall-drafting'

type Draft = {
  start: WallPlanPoint
  pointer: WallPlanPoint
  unit: 'metric' | 'imperial'
  metricNotation: 'meters' | 'millimeters'
  locale: string
}

/** The plan owns keys only when it is the sole visible scene. */
export function installPreciseWallKeys({
  target,
  draft,
  commit,
}: {
  target: Window
  draft: () => Draft | null
  commit: (pointer: WallPlanPoint) => void
}): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    const current = draft()
    if (!current || isTypingTarget(event.target)) return
    const action = routePreciseKey({ event, kind: 'wall' })
    if (!action) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (action !== 'submit') return
    const fields = usePrecisePlacement.getState().fields
    const result = resolvePreciseWallEnd({
      start: current.start,
      pointer: current.pointer,
      lengthText: fields[0],
      angleText: fields[1],
      lengthOptions: preciseLengthOptions(current),
      step: getSegmentGridStep(),
    })
    if (result.status === 'ready' && isSegmentLongEnough(current.start, result.point))
      commit(current.pointer)
  }
  target.addEventListener('keydown', onKeyDown, true)
  return () => target.removeEventListener('keydown', onKeyDown, true)
}
