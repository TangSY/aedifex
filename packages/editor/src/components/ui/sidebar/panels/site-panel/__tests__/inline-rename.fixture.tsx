import { expect, test } from 'bun:test'
import { AedifexI18nProvider, createI18n, LevelNode, useScene } from '@aedifex/core'
import { extend } from '@react-three/fiber'
import { create } from '@react-three/test-renderer'
import { Object3D } from 'three'
import { authoredLevelName } from '../../../../../../i18n/level-name'
import { registerBundledLocales } from '../../../../../../i18n/locales'
import { LevelInlineRename } from '../../../../floating-level-selector'
import { InlineRenameField, InlineRenameInput } from '../inline-rename-input'

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

test('a generated level name edits as empty without writing on blur', async () => {
  const prior = useScene.getState()
  const level = LevelNode.parse({ level: 1, name: 'Floor 1' })
  const updates: Array<{ id: string; name: string | undefined }> = []
  useScene.setState({
    nodes: { [level.id]: level },
    updateNode: (id, data) => {
      updates.push({ id, name: data.name })
    },
  })
  try {
    const renderer = await create(
      <InlineRenameInput
        defaultName="2 层"
        editableName={(name) => authoredLevelName({ name, level: level.level })}
        isEditing
        nodeId={level.id}
        onStopEditing={() => {}}
      />,
    )
    try {
      const input = renderer.scene.children[0]!
      expect(input.props.value).toBe('')
      expect(input.props.placeholder).toBe('2 层')
      await renderer.fireEvent(input, 'blur', {})
      expect(updates).toHaveLength(0)
      expect(useScene.getState().nodes[level.id]?.name).toBe('Floor 1')
      await renderer.fireEvent(input, 'change', { target: { value: '  Workshop  ' } })
      await renderer.fireEvent(input, 'blur', {})
      expect(updates).toEqual([{ id: level.id, name: 'Workshop' }])
    } finally {
      await renderer.unmount()
    }
  } finally {
    useScene.setState(prior, true)
  }
})

test('the floating level editor uses a localized placeholder without changing an untouched name', async () => {
  registerBundledLocales()
  const i18n = createI18n({ locale: 'zh-CN' })
  const prior = useScene.getState()
  const level = LevelNode.parse({ level: 1, name: 'Floor 1' })
  const updates: Array<{ id: string; name: string | undefined }> = []
  useScene.setState({
    nodes: { [level.id]: level },
    updateNode: (id, data) => {
      updates.push({ id, name: data.name })
    },
  })
  try {
    const renderer = await create(
      <AedifexI18nProvider i18n={i18n}>
        <LevelInlineRename isEditing level={level} onStopEditing={() => {}} />
      </AedifexI18nProvider>,
    )
    try {
      const input = renderer.scene.children[0]!
      expect(input.props.value).toBe('')
      expect(input.props.placeholder).toBe('2 层')
      await renderer.fireEvent(input, 'blur', {})
      expect(updates).toHaveLength(0)
      expect(useScene.getState().nodes[level.id]?.name).toBe('Floor 1')
      await renderer.fireEvent(input, 'change', { target: { value: '  Atelier  ' } })
      await renderer.fireEvent(input, 'blur', {})
      expect(updates).toEqual([{ id: level.id, name: 'Atelier' }])
    } finally {
      await renderer.unmount()
    }
  } finally {
    useScene.setState(prior, true)
    i18n.destroy()
  }
})

test('the floating level editor still clears an authored name', async () => {
  const prior = useScene.getState()
  const level = LevelNode.parse({ level: 1, name: 'Workshop' })
  const updates: Array<{ id: string; name: string | undefined }> = []
  useScene.setState({
    nodes: { [level.id]: level },
    updateNode: (id, data) => {
      updates.push({ id, name: data.name })
    },
  })
  try {
    const renderer = await create(
      <LevelInlineRename isEditing level={level} onStopEditing={() => {}} />,
    )
    try {
      const input = renderer.scene.children[0]!
      expect(input.props.value).toBe('Workshop')
      await renderer.fireEvent(input, 'change', { target: { value: '' } })
      await renderer.fireEvent(input, 'blur', {})
      expect(updates).toHaveLength(1)
      expect(updates[0]).toEqual({ id: level.id, name: undefined })
    } finally {
      await renderer.unmount()
    }
  } finally {
    useScene.setState(prior, true)
  }
})
