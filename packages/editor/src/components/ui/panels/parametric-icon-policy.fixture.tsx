import { expect, mock, spyOn, test } from 'bun:test'
import { configureClientAssetPolicy, LevelNode, nodeRegistry, useScene } from '@aedifex/core'
import { renderToStaticMarkup } from 'react-dom/server'
import { ParametricInspector } from './parametric-inspector'

mock.module('./panel-wrapper', () => ({
  PanelWrapper: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  InspectorFooterContext: {
    Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  },
}))
mock.module('../controls/panel-section', () => ({
  PanelSection: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}))

test('does not render unchecked action icon URLs', () => {
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
          capabilities: { deletable: false },
          presentation: { label: 'Plugin' },
          parametrics: {
            groups: [],
            actions: [
              { label: 'Action', iconSrc: 'https://blocked.example/action.png', onClick: () => {} },
            ],
          },
        } as never)
      : originalGet(kind),
  )
  configureClientAssetPolicy(['https://allowed.example'])
  try {
    initial.nodes = { [id]: node }
    const markup = renderToStaticMarkup(<ParametricInspector nodeId={id as never} />)
    expect(markup).toContain('Action')
    expect(markup).not.toContain('https://blocked.example/action.png')
  } finally {
    initial.nodes = previousNodes
    configureClientAssetPolicy(null)
    registry.mockRestore()
  }
})
