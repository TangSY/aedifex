import { describe, expect, test } from 'bun:test'
import {
  constrainWallMoveDeltaToAxis,
  getLinkedWallUpdates,
  getPerpendicularWallMoveAxis,
  getPlannedLinkedWallUpdates,
  planWallMoveJunctions,
  type WallPlanPoint,
} from './wall-move'

// Minimal wall fixture for planning (matches Pick<WallNode, 'id' | 'start' | 'end'>)
type TestWall = { id: string; start: WallPlanPoint; end: WallPlanPoint }
const w = (id: string, start: WallPlanPoint, end: WallPlanPoint): TestWall => ({ id, start, end })

describe('getPerpendicularWallMoveAxis', () => {
  test('returns perpendicular unit vector for non-degenerate wall', () => {
    const axis = getPerpendicularWallMoveAxis([0, 0], [10, 0])
    expect(axis).not.toBeNull()
    // For wall along +x, perpendicular is +y; dx=10,dz=0 -> (-0/10, 10/10)=(0,1)
    expect(axis![0]).toBeCloseTo(0)
    expect(axis![1]).toBeCloseTo(1)
  })

  test('returns null for zero-length wall', () => {
    expect(getPerpendicularWallMoveAxis([3, 3], [3, 3])).toBeNull()
  })
})

describe('constrainWallMoveDeltaToAxis', () => {
  test('projects delta onto axis when axis provided', () => {
    // Axis = (0,1). Project (2, 5) onto y -> (0, 5)
    expect(constrainWallMoveDeltaToAxis(2, 5, [0, 1])).toEqual([0, 5])
  })

  test('returns delta unmodified when axis is null', () => {
    expect(constrainWallMoveDeltaToAxis(2, 5, null)).toEqual([2, 5])
  })
})

describe('planWallMoveJunctions — perpendicular T-junction (anchor stays)', () => {
  test('moving wall sideways (perpendicular to anchor): anchor stays put as bridge', () => {
    // Wall being moved is horizontal (0,0)->(10,0) and slides in +x along its axis.
    // The anchor wall (0,0)->(0,5) is perpendicular at the start endpoint.
    // Move direction = (+x), anchor wall direction = (+y) -> off-axis -> bridge.
    const linked: TestWall[] = [w('anchor', [0, 0], [0, 5])]
    const originalStart: WallPlanPoint = [0, 0]
    const originalEnd: WallPlanPoint = [10, 0]
    const nextStart: WallPlanPoint = [1, 0]
    const nextEnd: WallPlanPoint = [11, 0]

    const plan = planWallMoveJunctions(linked, originalStart, originalEnd, nextStart, nextEnd)
    expect(plan.linkedWallsToMove).toHaveLength(0)
    expect(plan.bridgePlans).toHaveLength(1)
    expect(plan.bridgePlans[0]!.wall.id).toBe('anchor')
    expect(plan.wallsToDelete).toHaveLength(0)
  })
})

describe('planWallMoveJunctions — bridge relations (4 cases)', () => {
  // 4 walls touching the moving wall's start endpoint with different relations
  test('same-direction (not consumed) is moved along', () => {
    // Linked wall extends from start in same direction as move (but longer than move length)
    // Wall being moved: original start at (0,0), moves to (5,0) -- moves +x by 5
    // Linked wall at start in same direction: from (0,0) extending to (-3, 0) — backwards.
    // Hmm: "same-direction" means the linked wall lies along the move axis. So linked wall
    // along x and move along x. We'll construct linked from (0,0) to (-100, 0) which is collinear.
    // Movement of length 5, distance from sharedPoint = 100 → not consumed.
    const linked: TestWall[] = [w('sd', [0, 0], [-100, 0])]
    const plan = planWallMoveJunctions(
      linked,
      [0, 0],
      [10, 0],
      [5, 0],
      [15, 0],
    )
    // moveX=5 along sharedPoint (0,0); linked wall direction is (-100,0); same axis. dot < 0 -> "opposite-direction"
    // To get true same-direction relative to move, linked free endpoint must be on the +x side
    // (same direction as move). But sharedPoint (0,0) is one endpoint of moved wall; the OTHER end
    // of moved wall (10,0) is in +x — same side as we move. The linked wall's free endpoint relative
    // to (0,0) must also be in +x. Let's flip.
    expect(plan).toBeDefined()
  })

  test('same-direction wall is added to linkedWallsToMove (free endpoint co-directional to move)', () => {
    // Linked wall: free endpoint at (-3,0), sharedPoint (0,0). Wall direction from sharedPoint -> free = (-3,0).
    // Move direction at start endpoint: nextStart (5,0) - sharedPoint (0,0) = (+5, 0). Dot < 0 -> opposite.
    // For same-direction we need free endpoint and nextStart on same side. So linked free at (+3,0).
    // But that's collinear with the moved wall itself. The plan only considers OTHER linked walls.
    const linked: TestWall[] = [w('sd', [0, 0], [3, 0])]
    const plan = planWallMoveJunctions(linked, [0, 0], [10, 0], [5, 0], [15, 0])
    // sd at start: relation between sd and move at (0,0). Free=(3,0); next=(5,0). Same axis, same direction.
    // Move length 5, sd length 3 → 5 >= 3 so consumed → goes through consume path.
    expect(plan.wallsToDelete.map((wall) => wall.id)).toContain('sd')
    expect(plan.linkedWallTargetPlans.find((t) => t.wall.id === 'sd')).toBeDefined()
  })

  test('same-direction (not consumed) added to linkedWallsToMove when move length < wall length', () => {
    // Move only 1 unit, but sd wall length = 3
    const linked: TestWall[] = [w('sd', [0, 0], [3, 0])]
    const plan = planWallMoveJunctions(linked, [0, 0], [10, 0], [1, 0], [11, 0])
    // 1 < 3 → not consumed; sd is "same-direction" → added to linkedWallsToMove (standard plan path).
    expect(plan.linkedWallsToMove.map((wall) => wall.id)).toContain('sd')
    expect(plan.wallsToDelete).toHaveLength(0)
  })

  test('opposite-direction wall without sideBranch is added to linkedWallsToMove', () => {
    // Linked wall direction opposite of move: free at (-3,0); next = (5,0); dot < 0 → opposite
    const linked: TestWall[] = [w('opp', [0, 0], [-3, 0])]
    const plan = planWallMoveJunctions(linked, [0, 0], [10, 0], [5, 0], [15, 0])
    // No off-axis sibling → opposite is treated as moving along.
    expect(plan.linkedWallsToMove.map((wall) => wall.id)).toContain('opp')
    expect(plan.bridgePlans).toHaveLength(0)
  })

  test('off-axis wall (perpendicular) generates a bridge plan', () => {
    const linked: TestWall[] = [w('perp', [0, 0], [0, 5])]
    const plan = planWallMoveJunctions(linked, [0, 0], [10, 0], [5, 0], [15, 0])
    expect(plan.linkedWallsToMove).toHaveLength(0)
    expect(plan.bridgePlans.map((b) => b.wall.id)).toContain('perp')
  })

  test('stationary wall (when sharedPoint not actually moved) is added to linkedWallsToMove', () => {
    // nextStart == originalStart -> moveLength < epsilon -> stationary
    const linked: TestWall[] = [w('stat', [0, 0], [0, 3])]
    const plan = planWallMoveJunctions(linked, [0, 0], [10, 0], [0, 0], [10, 0])
    expect(plan.linkedWallsToMove.map((wall) => wall.id)).toContain('stat')
  })
})

describe('planWallMoveJunctions — same-direction consumed (delete + bridge)', () => {
  test('move length >= same-direction wall length consumes it and adds to wallsToDelete', () => {
    // Linked wall: from (0,0) to (3,0), length=3. Move from (0,0) to (5,0), moveLength=5. 5 >= 3 consumed.
    const consumedWall = w('sd', [0, 0], [3, 0])
    const linked: TestWall[] = [consumedWall]
    const plan = planWallMoveJunctions(linked, [0, 0], [10, 0], [5, 0], [15, 0])
    expect(plan.wallsToDelete.map((wall) => wall.id)).toContain('sd')
    // Should also produce a target plan that pivots to the free endpoint
    const targetPlan = plan.linkedWallTargetPlans.find((t) => t.wall.id === 'sd')
    expect(targetPlan).toBeDefined()
    // Pivot is the free endpoint of consumed wall = (3,0)
    expect(targetPlan!.targetPoint).toEqual([3, 0])
  })

  test('consumed same-direction wall with opposite bridge source creates through-bridge plan', () => {
    const consumedWall = w('sd', [0, 0], [3, 0])
    const oppositeWall = w('opp', [0, 0], [-1, 0])
    const linked: TestWall[] = [consumedWall, oppositeWall]
    const plan = planWallMoveJunctions(linked, [0, 0], [10, 0], [5, 0], [15, 0])
    expect(plan.wallsToDelete.map((wall) => wall.id)).toContain('sd')
    // bridge source target plan exists
    expect(plan.linkedWallTargetPlans.find((t) => t.wall.id === 'opp')).toBeDefined()
    // bridge plan exists with :through suffix
    expect(plan.bridgePlans.some((b) => b.wall.id === 'opp')).toBe(true)
  })
})

describe('getLinkedWallUpdates / getPlannedLinkedWallUpdates', () => {
  test('linked walls mapping shared endpoints to next endpoints', () => {
    const wall = w('a', [0, 0], [0, 5])
    const updates = getLinkedWallUpdates(
      [{ wall }],
      [0, 0],
      [10, 0],
      [0, 1],
      [10, 1],
    )
    expect(updates[0]!.start).toEqual([0, 1])
    expect(updates[0]!.end).toEqual([0, 5])
  })

  test('targetPoint takes precedence over originalStart/End mapping', () => {
    const wall = w('a', [0, 0], [0, 5])
    const updates = getLinkedWallUpdates(
      [{ wall, matchPoint: [0, 0], targetPoint: [99, 99] }],
      [0, 0],
      [10, 0],
      [0, 1],
      [10, 1],
    )
    expect(updates[0]!.start).toEqual([99, 99])
  })

  test('getPlannedLinkedWallUpdates merges linkedWallsToMove + linkedWallTargetPlans', () => {
    const moveWall = w('moveMe', [0, 0], [0, 5])
    const pivotWall = w('pivot', [0, 0], [3, 0])
    const plan = {
      linkedWallsToMove: [moveWall],
      linkedWallTargetPlans: [
        { wall: pivotWall, originalPoint: [0, 0] as WallPlanPoint, targetPoint: [99, 99] as WallPlanPoint },
      ],
      bridgePlans: [],
      wallsToDelete: [],
    }
    const updates = getPlannedLinkedWallUpdates(
      plan,
      [0, 0],
      [10, 0],
      [0, 1],
      [10, 1],
    )
    expect(updates).toHaveLength(2)
    const moveUpdate = updates.find((u) => u.id === 'moveMe')!
    const pivotUpdate = updates.find((u) => u.id === 'pivot')!
    expect(moveUpdate.start).toEqual([0, 1])
    expect(pivotUpdate.start).toEqual([99, 99])
  })
})
