import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { Euler, PerspectiveCamera, Vector3 } from 'three'
import ts from 'typescript'

// Run the production input handlers and frame callback without mounting a GPU
// canvas. AST selection keeps this a behaviour test, not a source-text assertion.
const source = ts.createSourceFile(
  'first-person-controls.tsx',
  readFileSync(new URL('./first-person-controls.tsx', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
)
const declarations = new Map<string, ts.Node>()
let droneFrame: ts.ArrowFunction | undefined
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    declarations.set(node.name.text, node)
  }
  if (ts.isFunctionDeclaration(node) && node.name) declarations.set(node.name.text, node)
  if (ts.isCallExpression(node) && node.expression.getText(source) === 'useFrame') {
    const callback = node.arguments[0]
    if (
      callback &&
      ts.isArrowFunction(callback) &&
      ts.isBlock(callback.body) &&
      callback.body.statements[0]?.getText(source) === 'if (!isDroneMode) return'
    )
      droneFrame = callback
  }
  ts.forEachChild(node, visit)
}
visit(source)

function declaration(name: string) {
  const node = declarations.get(name)
  if (!node) throw new Error(`Missing production handler: ${name}`)
  return ts.isFunctionDeclaration(node) ? node.getText(source) : `const ${node.getText(source)};`
}

function createHarness() {
  const camera = new PerspectiveCamera()
  const suspendRef = { current: false }
  const editor = { isCaptureMode: true, isFirstPersonMode: true, captureShutterHold: false }
  const document = {
    pointerLockElement: null as object | null,
    exitPointerLock() {
      this.pointerLockElement = null
      handlers.handlePointerLockChange()
    },
  }
  const canvas = {
    requestPointerLock() {
      document.pointerLockElement = canvas
      handlers.handlePointerLockChange()
    },
  }
  document.pointerLockElement = canvas
  const bindings = {
    camera,
    suspendRef,
    document,
    canvas,
    isDroneMode: true,
    hadPointerLockRef: { current: true },
    movementInputRef: { current: {} },
    controllerRef: { current: null },
    crouchKeyRef: { current: false },
    droneAscendKeyRef: { current: false },
    droneSlowKeyRef: { current: false },
    droneDescendKeyRef: { current: false },
    droneVelocityRef: { current: new Vector3() },
    yawRef: { current: 0 },
    pitchRef: { current: 0 },
    droneEuler: new Euler(0, 0, 0, 'YXZ'),
    droneForward: new Vector3(),
    droneRight: new Vector3(),
    droneDesiredVelocity: new Vector3(),
    useEditor: { getState: () => editor },
    useViewer: { getState: () => ({ setWalkthroughSuspended: () => {} }) },
    HTMLInputElement: class {},
    HTMLTextAreaElement: class {},
  }
  if (!droneFrame) throw new Error('Missing production drone frame callback')
  const code = [
    ...[
      'DRONE_SPEED',
      'DRONE_RUN_MULTIPLIER',
      'DRONE_SLOW_MULTIPLIER',
      'DRONE_SMOOTHING',
      'movementKeyboardBindings',
      'movementKeyToName',
      'inactiveMovementInput',
      'getMovementInputForKey',
      'applyMovementKey',
      'handleKeyDown',
      'handleKeyUp',
      'handleBlur',
      'handlePointerLockChange',
    ].map(declaration),
    `const frame = ${droneFrame.getText(source)};`,
    'return { handleKeyDown, handleKeyUp, handleBlur, handlePointerLockChange, frame };',
  ].join('\n')
  const output = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } })
  const handlers = new Function(...Object.keys(bindings), output.outputText)(
    ...Object.values(bindings),
  )
  const key = (code: string) => ({ code, target: {}, preventDefault() {}, stopPropagation() {} })
  return {
    camera,
    canvas,
    editor,
    suspendRef,
    down: (code: string) => handlers.handleKeyDown(key(code)),
    up: (code: string) => handlers.handleKeyUp(key(code)),
    blur: () => handlers.handleBlur(),
    frame: () => handlers.frame({}, 1 / 60),
  }
}

describe('drone cursor suspension', () => {
  for (const movementKey of ['KeyE', 'KeyQ', 'KeyW', 'ControlLeft']) {
    for (const pauseKey of ['KeyP', 'Escape']) {
      test(`${movementKey} → ${pauseKey} → keyup preserves framing and clears movement`, () => {
        const h = createHarness()
        h.down(movementKey)
        h.frame()
        expect(h.camera.position.length()).toBeGreaterThan(0)
        h.down(pauseKey)
        expect(h.suspendRef.current).toBe(true)
        h.up(movementKey)
        const pose = h.camera.position.toArray()
        for (let i = 0; i < 5; i += 1) h.frame()
        expect(h.camera.position.toArray()).toEqual(pose)
        h.canvas.requestPointerLock()
        for (let i = 0; i < 5; i += 1) h.frame()
        expect(h.camera.position.toArray()).toEqual(pose)
      })
    }
  }

  for (const movementKey of ['KeyE', 'KeyQ', 'KeyW', 'ControlLeft']) {
    test(`${movementKey} clears on blur even if keyup is lost while paused`, () => {
      const h = createHarness()
      h.down(movementKey)
      h.frame()
      h.down('KeyP')
      h.blur()
      const pose = h.camera.position.toArray()
      h.frame()
      h.canvas.requestPointerLock()
      h.frame()
      expect(h.camera.position.toArray()).toEqual(pose)
    })
  }

  for (const slowKey of ['AltLeft', 'AltRight']) {
    for (const pauseKey of ['KeyP', 'Escape']) {
      for (const release of ['keyup', 'blur']) {
        test(`${slowKey} → ${pauseKey} → ${release} restores normal speed after resume`, () => {
          const normal = createHarness()
          normal.down('KeyW')
          normal.frame()
          const normalStep = normal.camera.position.length()
          const h = createHarness()
          h.down(slowKey)
          h.down('KeyW')
          h.frame()
          expect(h.camera.position.length()).toBeLessThan(normalStep)
          h.down(pauseKey)
          expect(h.suspendRef.current).toBe(true)
          if (release === 'blur') h.blur()
          else {
            h.up(slowKey)
            h.up('KeyW')
          }
          const pose = h.camera.position.clone()
          h.frame()
          expect(h.camera.position.toArray()).toEqual(pose.toArray())
          h.canvas.requestPointerLock()
          h.frame()
          expect(h.camera.position.toArray()).toEqual(pose.toArray())
          h.down('KeyW')
          h.frame()
          expect(h.camera.position.distanceTo(pose)).toBeCloseTo(normalStep, 10)
        })
      }
    }
  }

  test('shutter hold keeps the drone fixed', () => {
    const h = createHarness()
    h.down('KeyE')
    h.editor.captureShutterHold = true
    h.frame()
    expect(h.camera.position.toArray()).toEqual([0, 0, 0])
  })
})
