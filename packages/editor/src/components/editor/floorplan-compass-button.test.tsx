import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { FloorplanCompassButton } from './floorplan-compass-button'

describe('FloorplanCompassButton', () => {
  test('keeps the synchronized compass prominent in the viewer top-right corner', () => {
    const markup = renderToStaticMarkup(
      <FloorplanCompassButton northRotationDeg={37} onAlignNorth={() => {}} />,
    )

    expect(markup).toContain('aria-label="Align view to north"')
    expect(markup).toContain('top-14')
    expect(markup).toContain('right-4')
    expect(markup).toContain('h-16')
    expect(markup).toContain('w-16')
    expect(markup).toContain('rotate(37deg)')
  })

  test('shows all four cardinal directions instead of a needle-only icon', () => {
    const markup = renderToStaticMarkup(
      <FloorplanCompassButton northRotationDeg={0} onAlignNorth={() => {}} />,
    )

    expect(markup).toContain('>N<')
    expect(markup).toContain('>S<')
    expect(markup).toContain('>E<')
    expect(markup).toContain('>W<')
  })
})
