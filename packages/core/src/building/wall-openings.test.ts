import { describe, expect, test } from 'bun:test'
import { type AgentRefusal, isAgentRefusal } from '../agent-tools/refusal'
import { openingScene, WALL_OPENING_CASES } from './__fixtures__/wall-opening-cases'
import { findWallChildOverlap, planWallOpening } from './wall-openings'

// Layer 1 of 3: the operation both agent surfaces call. The cases are the spec.
describe('planWallOpening', () => {
  for (const c of WALL_OPENING_CASES) {
    test(c.name, () => {
      const { nodes } = openingScene()
      const input = { kind: c.tool === 'add_door' ? 'door' : 'window', ...c.input } as never
      if ('refusal' in c.expect) {
        let error: unknown
        try {
          planWallOpening(nodes, input)
        } catch (thrown) {
          error = thrown
        }
        expect(isAgentRefusal(error)).toBe(true)
        expect((error as AgentRefusal).code).toBe(c.expect.refusal)
        for (const text of c.expect.mentions ?? []) expect((error as Error).message).toContain(text)
        return
      }
      const planned = planWallOpening(nodes, input)
      expect(planned.localX).toBeCloseTo(c.expect.localX, 6)
      expect(planned.node.position[0]).toBeCloseTo(c.expect.localX, 6)
      expect(planned.node.position[1]).toBeCloseTo(c.expect.centerY, 6)
      expect(planned.clamped).toBe(c.expect.clamped)
      if (c.expect.glassPanels) expect(JSON.stringify(planned.node)).toContain('"glass"')
    })
  }
})

for (const metadata of [null, false, 7, 'legacy', ['legacy']]) {
  test(`legacy JSON metadata ${JSON.stringify(metadata)} still blocks overlapping openings`, () => {
    const { nodes } = openingScene()
    nodes.door_existing = { ...nodes.door_existing!, metadata }
    expect(findWallChildOverlap('wall_busy', nodes, 2, 1.05, 0.9, 2.1)?.id).toBe('door_existing')
    expect(nodes.door_existing.metadata).toEqual(metadata)
  })
}
