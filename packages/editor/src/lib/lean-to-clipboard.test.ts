import { expect, test } from 'bun:test'
import {
  type AnyNodeDefinition,
  ColumnNode,
  LeanToExtensionNode,
  LevelNode,
  nodeRegistry,
  registerNode,
  useScene,
} from '@aedifex/core'
import { copySelectedNodesToEditorClipboard, pasteEditorClipboardToLevel } from './scene-clipboard'

test('copying a lean-to retains its post and remaps its owner', () => {
  const restore = nodeRegistry._snapshot()
  const oldNodes = useScene.getState().nodes
  const oldRoots = useScene.getState().rootNodeIds
  try {
    nodeRegistry._reset()
    registerNode({
      kind: 'column',
      schemaVersion: 1,
      schema: ColumnNode,
      category: 'structure',
      defaults: () => ({}),
      capabilities: { duplicable: { allow: ({ node }) => !node.metadata?.managedByLeanTo } },
    } as AnyNodeDefinition)
    registerNode({
      kind: 'lean-to-extension',
      schemaVersion: 1,
      schema: LeanToExtensionNode,
      category: 'structure',
      defaults: () => ({}),
      capabilities: { duplicable: true },
    } as AnyNodeDefinition)
    const level = LevelNode.parse({ id: 'level_copy_lean_to' })
    const owner = LeanToExtensionNode.parse({
      id: 'leanto_copy_source',
      parentId: level.id,
      children: ['column_copy_source'],
    })
    const post = ColumnNode.parse({
      id: 'column_copy_source',
      parentId: owner.id,
      metadata: { managedByLeanTo: owner.id, leanToRole: 'post' },
    })
    useScene.setState({
      nodes: { [level.id]: level, [owner.id]: owner, [post.id]: post },
      rootNodeIds: [level.id],
    } as never)
    expect(copySelectedNodesToEditorClipboard([post.id])).toBe(false)
    expect(copySelectedNodesToEditorClipboard([owner.id])).toBe(true)
    const result = pasteEditorClipboardToLevel(level.id)!
    const copy = Object.values(useScene.getState().nodes).find(
      (node) => node.type === 'column' && node.id !== post.id,
    )!
    expect(copy.parentId).toBe(result.pastedIds[0])
    expect((copy.metadata as Record<string, unknown>).managedByLeanTo).toBe(result.pastedIds[0])
  } finally {
    useScene.setState({ nodes: oldNodes, rootNodeIds: oldRoots })
    restore()
  }
})
