import { beforeEach, describe, expect, it } from 'vitest'
import { DESIGN_EXAMPLE } from '@aedifex/core/procedural-items'
import { executeRemoteMcpToolCall } from '../mcp-tool-router'
import { getSceneOperations, resetSceneOperationsForTesting } from '../scene-operations-adapter'

beforeEach(() => {
  resetSceneOperationsForTesting()
  const operations = getSceneOperations()
  operations.setScene({}, [])
  operations.loadDefault()
  operations.clearHistory()
})

describe('remote procedural design tools', () => {
  it('validates a design without modifying the scene', async () => {
    const operations = getSceneOperations()
    const before = operations.exportJSON()
    const result = await executeRemoteMcpToolCall({
      toolName: 'validate_design',
      args: { design: JSON.stringify(DESIGN_EXAMPLE) },
    })
    expect(result).toMatchObject({ ok: true, result: { valid: true } })
    expect(operations.exportJSON()).toEqual(before)
  })

  it('places a design through the shared planner and undoes it in one step', async () => {
    const operations = getSceneOperations()
    const level = Object.values(operations.getNodes()).find((node) => node.type === 'level')!
    const result = await executeRemoteMcpToolCall({
      toolName: 'place_design',
      args: { design: DESIGN_EXAMPLE, hostId: level.id, position: [1, 0, 1] },
    })
    expect(result.ok).toBe(true)
    const placed = result.result as { designId: `procedural-item_${string}`; parentId: string }
    expect(placed.parentId).toBe(level.id)
    expect(operations.getNode(placed.designId)).toMatchObject({ type: 'procedural-item' })
    expect(operations.getHistory().pastCount).toBe(1)
    operations.undo()
    expect(operations.getNode(placed.designId)).toBeNull()
  })

  it('rejects invalid placement input before any mutation', async () => {
    const operations = getSceneOperations()
    const before = operations.exportJSON()
    for (const args of [
      { design: DESIGN_EXAMPLE, hostId: 'level_missing', position: [0, 0, 0] },
      { design: DESIGN_EXAMPLE, hostId: 'level_missing', position: [0, 0] },
    ]) {
      const result = await executeRemoteMcpToolCall({ toolName: 'place_design', args })
      expect(result.ok).toBe(false)
      expect(result.error).toBeTruthy()
      expect(operations.exportJSON()).toEqual(before)
    }
  })
})
