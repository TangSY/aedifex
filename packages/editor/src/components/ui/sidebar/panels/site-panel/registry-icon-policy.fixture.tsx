import { expect, mock, spyOn, test } from 'bun:test'
import { configureClientAssetPolicy, LevelNode, nodeRegistry, useScene } from '@aedifex/core'
import { renderToStaticMarkup } from 'react-dom/server'
import { TreeNode } from './tree-node'

mock.module('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

test('does not expose unchecked registry icon URLs to the image optimizer', () => {
  const initial = useScene.getInitialState()
  const previousNodes = initial.nodes
  const node = { ...LevelNode.parse({ name: 'Plugin object' }), type: 'block' } as never
  const id = (node as { id: string }).id
  const originalGet = nodeRegistry.get.bind(nodeRegistry)
  const registry = spyOn(nodeRegistry, 'get').mockImplementation((kind) =>
    kind === 'block'
      ? ({
          ...originalGet(kind),
          kind,
          capabilities: { deletable: true },
          presentation: {
            label: 'Plugin',
            icon: { kind: 'url', src: 'https://blocked.example/icon.png' },
          },
        } as never)
      : originalGet(kind),
  )
  configureClientAssetPolicy(['https://allowed.example'])
  try {
    initial.nodes = { [id]: node }
    const markup = renderToStaticMarkup(<TreeNode depth={0} nodeId={id as never} />)
    expect(markup).toContain('Plugin object')
    expect(markup).not.toContain('https://blocked.example/icon.png')
  } finally {
    initial.nodes = previousNodes
    configureClientAssetPolicy(null)
    registry.mockRestore()
  }
})
