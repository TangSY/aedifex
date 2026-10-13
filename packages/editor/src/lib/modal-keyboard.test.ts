import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { isModalKeyboardTarget } from './modal-keyboard'

function sourceHandlers({ file, name }: { file: string; name: string }) {
  const source = ts.createSourceFile(
    file,
    readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const handlers: string[] = []
  let modalGuard = ''
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      if (node.name.text === name) handlers.push(node.initializer!.getText(source))
      if (node.name.text === 'blocksModalKey') modalGuard = `const ${node.getText(source)};`
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (!handlers.length) throw new Error(`Missing production handler: ${file}:${name}`)
  return { handlers, modalGuard }
}

function harness({
  handler,
  modalGuard = '',
  bindings = {},
}: {
  handler: string
  modalGuard?: string
  bindings?: Record<string, unknown>
}) {
  let actions = 0
  const act = () => {
    actions++
  }
  const defaults = {
    isModalKeyboardTarget,
    HTMLInputElement: class {},
    HTMLTextAreaElement: class {},
    HTMLElement: class {},
    isHistoryShortcut: (event: KeyboardEvent) =>
      (event.metaKey || event.ctrlKey) && event.key === 'z',
    isTypingTarget: () => false,
    applyMovementKey: () => {
      act()
      return true
    },
    cancel: act,
    onCancel: act,
    rotateCarried: act,
    rotateSession: act,
    copySelectedNodesToEditorClipboard: act,
    swallowNextClick: act,
    setMovingNodeOrigin: act,
    isFloorplanHovered: true,
    hasDuplicatable: true,
    phase: 'site',
    setFloorplanSelectionTool: act,
    onRestoreGroundLevel: act,
    onDuplicateSelected: act,
    isVersionPreviewMode: false,
    useDeleteConfirmation: { getState: () => ({ request: null }) },
    groupCurrentSelection: act,
    ungroupCurrentSelection: act,
    ...bindings,
  }
  const code = `let ctrlTapClean = true, shiftTapClean = true, altKey = false, shiftKey = false;
    let session = null;
    ${modalGuard}
    const handle = ${handler};
    return { handle, state: () => ({ctrlTapClean, shiftTapClean, altKey, shiftKey, session}) };`
  const output = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } })
  const result = new Function(...Object.keys(defaults), output.outputText)(
    ...Object.values(defaults),
  )
  return { ...result, actions: () => actions }
}

function key({
  target,
  value,
  ctrlKey = false,
}: {
  target: EventTarget
  value: string
  ctrlKey?: boolean
}) {
  return {
    target,
    key: value,
    code: value.length === 1 ? `Key${value.toUpperCase()}` : value,
    ctrlKey,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    repeat: false,
    defaultPrevented: false,
    stopped: false,
    preventDefault() {
      this.defaultPrevented = true
    },
    stopPropagation() {
      this.stopped = true
    },
    stopImmediatePropagation() {
      this.stopped = true
    },
  }
}
const modalTarget = Object.assign(new EventTarget(), { closest: () => ({}) as Element })
const sceneTarget = Object.assign(new EventTarget(), { closest: () => null })

describe('modal keyboard targets', () => {
  test('recognizes modal ancestors and accepts non-element events safely', () => {
    let selector = ''
    const target = Object.assign(new EventTarget(), {
      closest: (value: string) => {
        selector = value
        return {} as Element
      },
    })
    expect(isModalKeyboardTarget(target)).toBe(true)
    expect(selector).toContain('[role="dialog"][aria-modal="true"]')
    expect(selector).toContain('[role="alertdialog"][aria-modal="true"]')
    expect(isModalKeyboardTarget(sceneTarget)).toBe(false)
    expect(isModalKeyboardTarget(new EventTarget())).toBe(false)
    expect(isModalKeyboardTarget(null)).toBe(false)
  })
})

describe('production capture handlers with modal targets', () => {
  const entries = [
    ['hooks/use-keyboard.ts', 'handleSessionGroupKeyDown'],
    ['hooks/use-keyboard.ts', 'handleKeyDown'],
    ['hooks/use-keyboard.ts', 'handleKeyUp'],
    ['components/editor/group-actions.ts', 'onKeyDown'],
    ['components/editor/group-move-3d.ts', 'onKeyDown'],
    ['components/editor-2d/floorplan-group-move.tsx', 'onKeyDown'],
    ['components/editor-2d/floorplan-hotkey-handlers.tsx', 'handleKeyDown'],
    ['components/editor-2d/floorplan-registry-move-overlay.tsx', 'onKey'],
    ['components/editor/group-rotate-handle.tsx', 'onKeyDown'],
    ['components/editor/wall-move-side-handles.tsx', 'onKeyDown'],
    ['components/editor/handles/use-handle-drag.ts', 'onKeyDown'],
    ['components/systems/roof/roof-edit-system.tsx', 'onKeyDown'],
    ['components/editor/first-person-controls.tsx', 'handleKeyDown'],
  ]
  for (const [file, name] of entries) {
    test(`${file}:${name} leaves modal keys and editing state untouched`, () => {
      const { handlers, modalGuard } = sourceHandlers({ file, name })
      for (const handler of handlers) {
        const h = harness({ handler, modalGuard })
        for (const value of [
          'Delete',
          'Backspace',
          'r',
          't',
          'v',
          'Alt',
          'Shift',
          'Escape',
          'g',
          'c',
          'z',
        ]) {
          const event = key({
            target: modalTarget,
            value,
            ctrlKey: ['g', 'c', 'z'].includes(value),
          })
          h.handle(event)
          expect(event.defaultPrevented).toBe(false)
          expect(event.stopped).toBe(false)
        }
        expect(h.actions()).toBe(0)
        expect(h.state()).toMatchObject({ altKey: false, shiftKey: false, session: null })
      }
    })
  }

  test('Ctrl+G still groups outside a modal and resumes after ignoring a modal event', () => {
    const { handlers, modalGuard } = sourceHandlers({
      file: 'hooks/use-keyboard.ts',
      name: 'handleSessionGroupKeyDown',
    })
    const h = harness({ handler: handlers[0], modalGuard })
    const ignored = key({ target: modalTarget, value: 'g', ctrlKey: true })
    h.handle(ignored)
    expect(h.actions()).toBe(0)
    const normal = key({ target: sceneTarget, value: 'g', ctrlKey: true })
    h.handle(normal)
    expect(h.actions()).toBe(1)
    expect(normal.defaultPrevented).toBe(true)
    expect(normal.stopped).toBe(true)
  })

  test('focus entering a modal clears held modifier tap candidates before Escape can close it', () => {
    const { modalGuard } = sourceHandlers({ file: 'hooks/use-keyboard.ts', name: 'handleKeyUp' })
    const h = harness({ handler: '(event: Event) => blocksModalKey(event)', modalGuard })
    h.handle({ target: modalTarget })
    expect(h.state()).toMatchObject({ ctrlTapClean: false, shiftTapClean: false })
  })
})
