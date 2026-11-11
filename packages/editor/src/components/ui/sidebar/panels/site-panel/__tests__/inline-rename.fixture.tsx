import { expect, test } from 'bun:test'
import { extend } from '@react-three/fiber'
import { create } from '@react-three/test-renderer'
import { Object3D } from 'three'
import { InlineRenameField } from '../inline-rename-input'

class Input extends Object3D {
  focus() {}
  select() {}
}

extend({ Input })
globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

test('leaving an unchanged unnamed item does not save', async () => {
  const saves: Array<string | undefined> = []
  let stops = 0
  const renderer = await create(
    <InlineRenameField
      defaultName="Default"
      isEditing
      name={undefined}
      onRename={(value) => saves.push(value)}
      onStopEditing={() => {
        stops++
      }}
    />,
  )
  try {
    await renderer.fireEvent(renderer.scene.children[0]!, 'blur', {})
    expect(saves).toHaveLength(0)
    expect(stops).toBe(1)
  } finally {
    await renderer.unmount()
  }
})

test('clearing an existing name saves undefined', async () => {
  const saves: Array<string | undefined> = []
  const renderer = await create(
    <InlineRenameField
      defaultName="Default"
      isEditing
      name="Existing"
      onRename={(value) => saves.push(value)}
      onStopEditing={() => {}}
    />,
  )
  try {
    const input = renderer.scene.children[0]!
    await renderer.fireEvent(input, 'change', { target: { value: '  ' } })
    await renderer.fireEvent(input, 'blur', {})
    expect(saves).toHaveLength(1)
    expect(saves[0]).toBeUndefined()
  } finally {
    await renderer.unmount()
  }
})

test('a new name is trimmed and saved', async () => {
  const saves: Array<string | undefined> = []
  const renderer = await create(
    <InlineRenameField
      defaultName="Default"
      isEditing
      name={undefined}
      onRename={(value) => saves.push(value)}
      onStopEditing={() => {}}
    />,
  )
  try {
    const input = renderer.scene.children[0]!
    await renderer.fireEvent(input, 'change', { target: { value: '  Workshop  ' } })
    await renderer.fireEvent(input, 'blur', {})
    expect(saves).toEqual(['Workshop'])
  } finally {
    await renderer.unmount()
  }
})
