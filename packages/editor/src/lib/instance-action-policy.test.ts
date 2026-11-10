import { afterAll, beforeAll, expect, test } from 'bun:test'
import {
  type AnyNode,
  type AnyNodeDefinition,
  type AnyNodeId,
  isMoveLocked,
  isNodeDuplicable,
  nodeRegistry,
  registerNode,
  useScene,
} from '@aedifex/core'
import { z } from 'zod'
import { duplicateNodeAndPickUp } from '../components/editor/duplicate-node'
import { classifyParticipant } from '../components/editor/group-transform-shared'
import useEditor from '../store/use-editor'
import useInteractionScope from '../store/use-interaction-scope'
import { createEditorApi } from './editor-api'
import { duplicateWithoutMove, registryMoveDisabled } from './node-action-movement'
import { copySelectedNodesToEditorClipboard } from './scene-clipboard'

const kind = 'instance-action-policy-test'
let restoreRegistry: () => void
const makeNode = (locked: boolean) =>
  ({
    id: locked ? 'policy_locked' : 'policy_free',
    type: kind,
    parentId: 'level_policy',
    position: [1, 0, 2],
    rotation: 0,
    metadata: { locked },
  }) as unknown as AnyNode

beforeAll(() => {
  restoreRegistry = nodeRegistry._snapshot()
  registerNode({
    kind,
    schemaVersion: 1,
    schema: z.object({ type: z.literal(kind) }),
    category: 'structure',
    defaults: () => ({}),
    capabilities: {
      movable: {
        axes: ['x', 'z'],
        override: ({ node }) =>
          (node.metadata as { locked?: boolean }).locked ? { axes: [] } : null,
      },
      duplicable: { allow: ({ node }) => !(node.metadata as { locked?: boolean }).locked },
    },
    floorplanMoveTarget: () => ({
      affectedIds: [],
      apply() {},
      canCommit: () => false,
      commit() {},
    }),
    renderer: { kind: 'parametric', module: async () => ({ default: () => null }) },
  } as AnyNodeDefinition)
})
afterAll(() => {
  useEditor.getState().setMovingNode(null)
  restoreRegistry()
})

test('per-node policy overrides kind-level movers across interaction paths', () => {
  const locked = makeNode(true)
  const free = makeNode(false)
  const nodes = { [locked.id]: locked, [free.id]: free }
  expect(isMoveLocked(locked)).toBe(true)
  expect(isMoveLocked(free)).toBe(false)
  expect(registryMoveDisabled(locked)).toBe(true)
  expect(registryMoveDisabled(free)).toBe(false)
  expect(classifyParticipant(locked, 'level_policy', nodes)).toBeNull()
  expect(classifyParticipant(free, 'level_policy', nodes)).toBe('scalar')
  const api = createEditorApi()
  api.engageMoveDrag(locked)
  expect(useInteractionScope.getState().scope.kind).toBe('idle')
  expect(useEditor.getState().placementDragMode).toBe(false)
  api.engageMove(free)
  expect(useInteractionScope.getState().scope.kind).toBe('moving')
  useEditor.getState().setMovingNode(null)
})

test('per-node duplicate policy blocks direct copy and clipboard selection', () => {
  const locked = makeNode(true)
  const free = makeNode(false)
  const level = {
    id: 'level_policy',
    type: 'level',
    parentId: null,
    children: [locked.id, free.id],
  } as unknown as AnyNode
  const oldNodes = useScene.getState().nodes
  const oldRoots = useScene.getState().rootNodeIds
  try {
    useScene.setState({
      nodes: { [level.id]: level, [locked.id]: locked, [free.id]: free } as never,
      rootNodeIds: [level.id as AnyNodeId],
    })
    expect(isNodeDuplicable(locked)).toBe(false)
    expect(isNodeDuplicable(free)).toBe(true)
    expect(duplicateWithoutMove(locked)).toBeNull()
    duplicateNodeAndPickUp(locked)
    expect(Object.keys(useScene.getState().nodes)).toHaveLength(3)
    expect(copySelectedNodesToEditorClipboard([locked.id as AnyNodeId])).toBe(false)
    expect(copySelectedNodesToEditorClipboard([free.id as AnyNodeId])).toBe(true)
  } finally {
    useScene.setState({ nodes: oldNodes, rootNodeIds: oldRoots })
  }
})
