import { expect, mock, test } from 'bun:test'
import { configureClientAssetPolicy } from '@aedifex/core'
import { renderToStaticMarkup } from 'react-dom/server'
import { FunctionTreePanel } from './function-tree-panel'

mock.module('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

test('does not send an unchecked category icon to the image optimizer', () => {
  configureClientAssetPolicy(['https://allowed.example'])
  try {
    const markup = renderToStaticMarkup(
      <FunctionTreePanel
        functionTree={[
          {
            slug: 'a',
            name: 'Category',
            iconUrl: 'https://blocked.example/icon.png',
            children: [],
          },
        ]}
      />,
    )
    expect(markup).not.toContain('https://blocked.example/icon.png')
    expect(markup).toContain('aria-label="Category"')
  } finally {
    configureClientAssetPolicy(null)
  }
})

test('uses the category abbreviation when no icon is supplied', () => {
  const markup = renderToStaticMarkup(
    <FunctionTreePanel functionTree={[{ slug: 'b', name: 'Furniture', children: [] }]} />,
  )
  expect(markup).toContain('Fu')
})
