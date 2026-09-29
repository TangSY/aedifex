import { describe, expect, test } from 'bun:test'

describe('plugin-owned XR wand', () => {
  test('does not depend on Aedifex editor modules', async () => {
    const files = [
      'build-panel.tsx',
      'paint-panel.tsx',
      'settings-panel.tsx',
      'spatial-controls.tsx',
      'wand-input-overlay.tsx',
      'wand-panel-shell.tsx',
      'wand-panel.tsx',
    ]
    const sources = await Promise.all(
      files.map((file) => Bun.file(new URL(file, import.meta.url)).text()),
    )

    expect(sources.join('\n')).not.toMatch(/@aedifex\/editor|from ['"]@\//)
  })

  test('owns left-hand attachment for controllers and hands', async () => {
    const source = await Bun.file(new URL('wand-input-overlay.tsx', import.meta.url)).text()

    expect(source).toMatch(/handedness\s*!==\s*["']left["']/)
    expect(source).toContain('<XRSpace space="grip-space">')
    expect(source).toContain('XR_WAND_PANEL_LAYOUT.attachment.handSpace')
  })

  test('owns all three wand faces', async () => {
    const source = await Bun.file(new URL('wand-panel.tsx', import.meta.url)).text()

    expect(source).toContain('<XRWandBuildPanel')
    expect(source).toContain('<XRWandPaintPanel')
    expect(source).toContain('<XRWandSettingsPanel')
  })

  test('keeps pointer interaction on raycastable meshes', async () => {
    const source = await Bun.file(new URL('spatial-controls.tsx', import.meta.url)).text()
    const buttonSource = source.slice(
      source.indexOf('export function SpatialButton'),
      source.indexOf('export function PanelFace'),
    )

    expect(buttonSource).toMatch(/<mesh[\s\S]*onClick=/)
    expect(buttonSource).toContain('setPointerCapture?.(event.pointerId)')
    expect(buttonSource).toContain('releasePointerCapture?.(event.pointerId)')
  })
})
