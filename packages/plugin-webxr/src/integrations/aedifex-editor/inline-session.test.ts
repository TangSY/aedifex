import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function sessionEffect() {
  const source = ts.createSourceFile('inline-session.tsx', readFileSync(new URL('./inline-session.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let effect = ''
  const visit = (node: ts.Node) => {
    if (!effect && ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect') effect = node.arguments[0]!.getText(source)
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (!effect) throw new Error('Missing XR presentation effect')
  const output = ts.transpileModule(`return (${effect})();`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return new Function('session', 'useEditor', 'useViewer', 'sceneLayout', output)
}

describe('XR presentation restores complete view layouts', () => {
  test.each([
    { split: true, panes: ['2d', 'plugin:gallery'], ratio: 0.32, focus: 1 },
    { split: true, panes: ['plugin:gallery', '3d'], ratio: 0.68, focus: 0 },
    { split: false, panes: ['plugin:gallery', '2d'], ratio: 0.4, focus: 0 },
  ])('keeps plugin panes, ratio and focus across an XR session: %j', (layout) => {
    const before: Record<string, { split: boolean; panes: readonly string[]; ratio: number; focus: number }> = { edit: layout, studio: { split: true, panes: ['3d', 'plugin:render'], ratio: 0.7, focus: 1 } }
    const editor = {
      viewLayouts: before, workspaceMode: 'edit', viewMode: '2d',
      isFirstPersonMode: true, isPreviewMode: true, isCaptureMode: true, mode: 'build', tool: 'wall' as string | null,
      setFirstPersonMode(value: boolean) { this.isFirstPersonMode = value },
      setPreviewMode(value: boolean) { this.isPreviewMode = value },
      setCaptureMode(value: boolean) { this.isCaptureMode = value },
      setViewLayout(value: unknown) { this.viewLayouts = { ...this.viewLayouts, [this.workspaceMode]: value } as typeof before },
      setMode(value: string) { this.mode = value },
      setTool(value: string | null) { this.tool = value },
    }
    const viewer = {
      cameraMode: 'orthographic', wallMode: 'cutaway', levelMode: 'exploded',
      setCameraMode(value: string) { this.cameraMode = value },
      setWallMode(value: string) { this.wallMode = value },
      setLevelMode(value: string) { this.levelMode = value },
    }
    const three = { split: false, panes: ['3d', '2d'], ratio: 0.5, focus: 0 }
    const exit = sessionEffect()({}, { getState: () => editor, setState: (patch: Partial<typeof editor>) => Object.assign(editor, patch) }, { getState: () => viewer }, () => three)
    expect(editor.viewLayouts.edit).toEqual(three)
    expect(editor.viewLayouts.studio).toEqual(before.studio)
    expect(viewer).toMatchObject({ cameraMode: 'perspective', wallMode: 'up', levelMode: 'stacked' })
    exit()
    expect(editor.viewLayouts).toEqual(before)
    expect(editor).toMatchObject({ isFirstPersonMode: false, isPreviewMode: false, isCaptureMode: false, mode: 'select', tool: null })
    expect(viewer).toMatchObject({ cameraMode: 'orthographic', wallMode: 'cutaway', levelMode: 'exploded' })
  })
})
