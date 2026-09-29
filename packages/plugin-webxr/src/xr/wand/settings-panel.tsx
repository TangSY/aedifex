'use client'

import { useState, useSyncExternalStore } from 'react'
import { SpatialScroll } from './spatial-scroll'
import { SpatialLine } from './spatial-line'
import { PanelIcon } from './panel-icon'
import type { XRWandAction, XRWandAdapter, XRWandSettingRow, XRWandSettingsModel } from './adapter'
import {
  PanelHeader,
  PanelHint,
  SettingChoice,
  SettingCycle,
  SettingStepper,
  SpatialButton,
} from './spatial-controls'
import { SpatialText } from './spatial-text'
import { XR_WAND_THEME } from './theme'
import { useXRWorkspace } from './workspace-store'

function ActionButton({ action, width = 0.7 }: { action: XRWandAction; width?: number }) {
  return (
    <SpatialButton
      disabled={action.disabled || !action.onSelect}
      name={`xr-setting-${action.id}`}
      onClick={action.onSelect}
      position={[0, 0, 0]}
      size={[width, 0.075]}
    >
      {action.icon && (
        <group position={[-width / 2 + 0.047, 0, 0]}>
          <PanelIcon src={action.icon.src} color={action.icon.color} positionY={0} size={0.058} />
        </group>
      )}
      <SpatialText
        color={XR_WAND_THEME.text}
        fontSize={width < 0.4 ? 0.021 : 0.026}
        maxWidth={width - (action.icon ? 0.12 : 0.04)}
        position={[action.icon ? 0.04 : 0, 0, 0.012]}
      >
        {action.label}
      </SpatialText>
    </SpatialButton>
  )
}

function SubscribedChoice({
  row,
}: {
  row: Extract<XRWandSettingRow, { kind: 'subscribed-choice' }>
}) {
  const value = useSyncExternalStore(row.subscribe, row.getValue, row.getValue)
  return (
    <SettingChoice
      label={row.label}
      name={`xr-setting-${row.id}`}
      onClick={row.onSelect}
      value={value}
    />
  )
}

export function SettingRow({ row }: { row: XRWandSettingRow }) {
  if (row.kind === 'text') return <SettingChoice label={row.label} name={`xr-setting-${row.id}`} value={row.value} />
  if (row.kind === 'stepper') {
    return (
      <SettingStepper
        mixed={row.mixed}
        label={row.label}
        max={row.max}
        min={row.min}
        name={`xr-setting-${row.id}`}
        onChange={row.onChange}
        step={row.step}
        unit={row.unit}
        value={row.value}
      />
    )
  }
  if (row.kind === 'cycle') {
    return (
      <SettingCycle
        label={row.label}
        name={`xr-setting-${row.id}`}
        next={row.next}
        previous={row.previous}
        value={row.mixed ? 'Mixed' : row.value}
      />
    )
  }
  if (row.kind === 'choice') {
    return (
      <SettingChoice
        label={row.label}
        name={`xr-setting-${row.id}`}
        onClick={row.onSelect}
        value={row.mixed ? 'Mixed' : row.value}
      />
    )
  }
  if (row.kind === 'subscribed-choice') return <SubscribedChoice row={row} />
  if (row.kind === 'actions') {
    const width = Math.min(0.7 / Math.max(1, row.actions.length), 0.32)
    return (
      <group>
        {row.actions.map((action, index) => (
          <group
            key={action.id}
            position={[(index - (row.actions.length - 1) / 2) * (width + 0.04), 0, 0]}
          >
            <ActionButton action={action} width={width} />
          </group>
        ))}
      </group>
    )
  }
  return <ActionButton action={row} />
}

function WideSettingRow({ row, onEdit }: { row: XRWandSettingRow; onEdit?: (row: Extract<XRWandSettingRow, { kind: 'text' }>) => void }) {
  if (row.kind === 'text') return <ActionButton action={{ id: row.id, label: `${row.label}: ${row.value}`, onSelect: () => onEdit?.(row) }} width={1.12} />
  if (row.kind === 'action') return <ActionButton action={row} width={1.12} />
  if (row.kind === 'actions') return <SettingRow row={row} />
  if (row.kind === 'subscribed-choice') return <WideSubscribedChoice row={row} />
  const label = row.label
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (value) => value.toUpperCase())
  const button = (
    name: string,
    text: string,
    x: number,
    width: number,
    onClick?: () => void,
    disabled = false,
  ) => (
    <SpatialButton
      name={name}
      position={[x, 0, 0]}
      size={[width, 0.082]}
      onClick={onClick}
      disabled={disabled || !onClick}
    >
      <SpatialText
        color={disabled || !onClick ? XR_WAND_THEME.muted : XR_WAND_THEME.text}
        fontSize={text.length > 20 ? 0.021 : 0.026}
        maxWidth={width - 0.025}
        position={[0, 0, 0.014]}
      >
        {text}
      </SpatialText>
    </SpatialButton>
  )
  return (
    <group>
      <SpatialText
        anchorX="left"
        color={XR_WAND_THEME.text}
        fontSize={0.026}
        maxWidth={0.52}
        textAlign="left"
        position={[-0.55, 0, 0.014]}
      >
        {label}
      </SpatialText>
      {row.kind === 'choice' ? (
        button(`xr-setting-${row.id}`, row.mixed ? 'Mixed' : row.value, 0.32, 0.46, row.onSelect)
      ) : (
        <>
          {button(
            `xr-setting-${row.id}-${row.kind === 'stepper' ? 'decrement' : 'previous'}`,
            row.kind === 'stepper' ? '−' : '‹',
            0.09,
            0.085,
            row.kind === 'stepper'
              ? () => row.onChange(Math.max(row.min, row.value - row.step))
              : row.previous,
            row.kind === 'stepper' && row.value <= row.min,
          )}
          <SpatialText
            color={XR_WAND_THEME.text}
            fontSize={0.025}
            maxWidth={0.28}
            position={[0.32, 0, 0.014]}
          >
            {row.mixed ? 'Mixed' : row.kind === 'stepper'
              ? `${Number(row.value.toFixed(3))}${row.unit ? ` ${row.unit}` : ''}`
              : row.value}
          </SpatialText>
          {button(
            `xr-setting-${row.id}-${row.kind === 'stepper' ? 'increment' : 'next'}`,
            row.kind === 'stepper' ? '+' : '›',
            0.55,
            0.085,
            row.kind === 'stepper'
              ? () => row.onChange(Math.min(row.max, row.value + row.step))
              : row.next,
            row.kind === 'stepper' && row.value >= row.max,
          )}
        </>
      )}
      <SpatialLine
        color={XR_WAND_THEME.border}
        opacity={0.22}
        points={[
          [-0.56, -0.06, 0.01],
          [0.59, -0.06, 0.01],
        ]}
      />
    </group>
  )
}

function WideSubscribedChoice({
  row,
}: {
  row: Extract<XRWandSettingRow, { kind: 'subscribed-choice' }>
}) {
  const value = useSyncExternalStore(row.subscribe, row.getValue, row.getValue)
  return <WideSettingRow row={{ ...row, kind: 'choice', value }} />
}

export function SettingsInspector({ model }: { model: XRWandSettingsModel }) {
  const [editing, setEditing] = useState<{ row: Extract<XRWandSettingRow, { kind: 'text' }>; value: string } | null>(null)
  const [uppercase, setUppercase] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const sections = new Map<string, XRWandSettingRow[]>()
  for (const row of model.rows) {
    const name = row.section ?? 'Properties'
    const rows = sections.get(name) ?? []
    rows.push(row)
    sections.set(name, rows)
  }
  const entries: ({ kind: 'header'; name: string } | { kind: 'row'; row: XRWandSettingRow })[] = []
  for (const [name, rows] of sections) {
    entries.push({ kind: 'header', name })
    if (!collapsed.has(name)) entries.push(...rows.map(row => ({ kind: 'row' as const, row })))
  }
  const cursor = entries.length * 0.13
  const renderEntry = (entry: (typeof entries)[number], index: number) => (
    <group key={entry.kind === 'header' ? `section-${entry.name}` : entry.row.id} position={[0, -index * 0.13 - 0.065, 0]}>
      {entry.kind === 'row' ? <WideSettingRow row={entry.row} onEdit={row => setEditing({ row, value: row.value })} /> : (
        <SpatialButton
          name={`xr-settings-section-${entry.name}`}
          position={[0, 0, 0]}
          size={[1.18, 0.072]}
          onClick={() => setCollapsed(current => {
            const next = new Set(current)
            if (next.has(entry.name)) next.delete(entry.name)
            else next.add(entry.name)
            return next
          })}
        >
          <SpatialText anchorX="left" color={XR_WAND_THEME.accentLine} fontSize={0.025} maxWidth={0.97} position={[-0.55, 0, 0.014]}>
            {entry.name}
          </SpatialText>
          <SpatialText color={XR_WAND_THEME.muted} fontSize={0.024} position={[0.51, 0, 0.014]}>
            {collapsed.has(entry.name) ? '+' : '−'}
          </SpatialText>
        </SpatialButton>
      )}
    </group>
  )
  const actions = model.onClearSelection
    ? [
        {
          id: 'clear-selection',
          label: 'Deselect',
          onSelect: model.onClearSelection,
        },
      ]
    : (model.headerActions ?? [])
  return (
    <group name="xr-wand-settings-panel">
      <PanelHeader mark={model.onDelete ? undefined : model.mark} onDelete={model.onDelete} title={model.title} width={1.4} />
      <group position={[0, 0.34, 0]}>
        {actions.map((action, index) => (
          <group key={action.id} position={[(index - (actions.length - 1) / 2) * 0.41, 0, 0]}>
            <ActionButton action={action} width={actions.length === 1 ? 1.18 : 0.38} />
          </group>
        ))}
      </group>
      {editing ? (
        <group name="xr-settings-keyboard">
          <SpatialText color={XR_WAND_THEME.text} fontSize={0.035} maxWidth={1.1} position={[0, 0.2, 0.014]}>{editing.value || 'Enter a name'}</SpatialText>
          {[...(uppercase ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' : 'abcdefghijklmnopqrstuvwxyz'), ...'0123456789-'].map((key, index) => (
            <SpatialButton key={key} name={`xr-key-${key}`} position={[(index % 10 - 4.5) * 0.115, 0.08 - Math.floor(index / 10) * 0.09, 0]} size={[0.105, 0.08]} onClick={() => setEditing(current => current && ({ ...current, value: (current.value + key).slice(0, 48) }))}>
              <SpatialText color={XR_WAND_THEME.text} fontSize={0.03} position={[0, 0, 0.014]}>{key}</SpatialText>
            </SpatialButton>
          ))}
          {[
            { label: 'Shift', run: () => setUppercase(value => !value) },
            { label: 'Space', run: () => setEditing(current => current && ({ ...current, value: (current.value + ' ').slice(0, 48) })) },
            { label: 'Erase', run: () => setEditing(current => current && ({ ...current, value: current.value.slice(0, -1) })) },
            { label: 'Cancel', run: () => setEditing(null) },
            { label: 'Save', run: () => { if (editing.value.trim()) { editing.row.onChange(editing.value.trim()); setEditing(null) } } },
          ].map((key, index) => (
            <SpatialButton key={key.label} name={`xr-key-${key.label}`} position={[(index - 2) * 0.23, -0.31, 0]} size={[0.21, 0.08]} onClick={key.run}>
              <SpatialText color={XR_WAND_THEME.text} fontSize={0.025} position={[0, 0, 0.014]}>{key.label}</SpatialText>
            </SpatialButton>
          ))}
        </group>
      ) : <SpatialScroll
        name="xr-settings-properties-scroll"
        width={1.25}
        height={0.67}
        contentHeight={cursor}
        virtualRows={{ count: entries.length, height: 0.13 }}
        position={[-0.014, -0.075, 0]}
      >
        {({ start, end }) => <group position={[0, 0.335, 0]}>{entries.slice(start, end).map((entry, index) => renderEntry(entry, start + index))}</group>}
      </SpatialScroll>}
      {!model.rows.length && (
        <PanelHint position={[0, 0, 0.014]}>
          {model.emptyMessage ?? 'No properties available'}
        </PanelHint>
      )}
      <SpatialText
        color={XR_WAND_THEME.muted}
        fontSize={0.021}
        maxWidth={1.2}
        position={[0, -0.468, 0.014]}
      >
        {cursor > 0.67
          ? 'Hold trigger or pinch and drag · Tap a section to collapse'
          : 'Tap a control to change its value'}
      </SpatialText>
    </group>
  )
}

export function XRWandSettingsPanel({ adapter, panelPlacement = false, workspaceOnly = false }: {
  adapter: XRWandAdapter
  panelPlacement?: boolean
  workspaceOnly?: boolean
}) {
  const model = adapter.useSettingsModel({ scope: workspaceOnly ? 'workspace' : 'selection', unpaged: true })
  const settings = panelPlacement ? {
    ...model,
    rows: [
      ...model.rows,
      {
        kind: 'action' as const,
        id: 'bring-workspace-here',
        section: 'Panel placement',
        label: 'Bring workspace here · Reset panel offset',
        onSelect: () => useXRWorkspace.getState().recall(),
      },
      {
        kind: 'action' as const,
        id: 'reset-panel-offset',
        section: 'Panel placement',
        label: 'Reset panel offset · Keep workspace position',
        onSelect: () => useXRWorkspace.getState().resetPanelPosition(),
      },
    ],
  } : model
  return <SettingsInspector key={model.contextKey ?? model.title} model={settings} />
}
