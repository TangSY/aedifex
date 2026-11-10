import { describe, expect, test } from 'bun:test'
import { ColumnNode, isMovable, isNodeDuplicable, nodeRegistry, registerNode } from '@aedifex/core'
import { columnDefinition } from './definition'

describe('column definition', () => {
  test('keeps only user-owned handles for lean-to managed columns', () => {
    const column = ColumnNode.parse({
      metadata: {
        managedByLeanTo: 'lean_to_1',
        leanToRole: 'post',
      },
    })
    const handles =
      typeof columnDefinition.handles === 'function'
        ? columnDefinition.handles(column)
        : columnDefinition.handles

    expect(handles.map((handle) => handle.kind)).toEqual(['arc-resize'])
  })

  test('keeps brace and rotation handles for lean-to managed K-brace columns', () => {
    const column = ColumnNode.parse({
      supportStyle: 'k-brace',
      metadata: {
        managedByLeanTo: 'lean_to_1',
        leanToRole: 'post',
      },
    })
    const handles =
      typeof columnDefinition.handles === 'function'
        ? columnDefinition.handles(column)
        : columnDefinition.handles

    expect(handles.map((handle) => handle.kind)).toEqual([
      'linear-resize',
      'linear-resize',
      'arc-resize',
    ])
  })

  test('managed posts cannot be moved while ordinary columns remain movable', () => {
    const restore = nodeRegistry._snapshot()
    try {
      nodeRegistry._reset()
      registerNode(columnDefinition as never)
      const managed = ColumnNode.parse({
        metadata: { managedByLeanTo: 'lean_to_1', leanToRole: 'post' },
      })
      const ordinary = ColumnNode.parse({})
      expect(isNodeDuplicable(managed)).toBe(false)
      expect(isNodeDuplicable(ordinary)).toBe(true)
      expect(isMovable(managed)).toBe(false)
      expect(isMovable(ordinary)).toBe(true)
    } finally {
      restore()
    }
  })
})
