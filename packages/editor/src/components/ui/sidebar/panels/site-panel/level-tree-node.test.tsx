import { expect, test } from 'bun:test'
import { AedifexI18nProvider, createI18n, LevelNode, useScene } from '@aedifex/core'
import { renderToStaticMarkup } from 'react-dom/server'
import { registerBundledLocales } from '../../../../../i18n/locales'
import { TreeNode } from './tree-node'

test('the level tree localizes generated names without changing authored names or scene data', () => {
  registerBundledLocales()
  const i18n = createI18n({ locale: 'zh-CN' })
  const initial = useScene.getInitialState()
  const oldNodes = initial.nodes
  const generated = LevelNode.parse({ level: 1, name: 'Floor 1' })
  const authored = LevelNode.parse({ level: 2, name: 'Workshop' })
  try {
    initial.nodes = { [generated.id]: generated, [authored.id]: authored }
    const render = (nodeId: typeof generated.id) =>
      renderToStaticMarkup(
        <AedifexI18nProvider i18n={i18n}>
          <TreeNode depth={0} nodeId={nodeId} />
        </AedifexI18nProvider>,
      )
    expect(render(generated.id)).toContain('2 层')
    expect(render(authored.id)).toContain('Workshop')
    i18n.setLocale('ja')
    expect(render(generated.id)).toContain('2階')
    expect(render(authored.id)).toContain('Workshop')
    i18n.setLocale('en')
    expect(render(generated.id)).toContain('Floor 1')
    expect(initial.nodes[generated.id]?.name).toBe('Floor 1')
  } finally {
    initial.nodes = oldNodes
    i18n.destroy()
  }
})
