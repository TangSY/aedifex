'use client'


import {
  type AnyNode,
  type AnyNodeId,
  type BuildingNode,
  DEFAULT_LEVEL_HEIGHT,
  getLevelDisplayName,
  getLibraryMaterialIdFromRef,
  getLibraryMaterialsVersion,
  getMaterialsForCategory,
  LevelNode,
  MATERIAL_CATEGORIES,
  nodeRegistry,
  type ParametricDescriptor,
  subscribeLibraryMaterials,
  toLibraryMaterialRef,
  useRegistryVersion,
  useScene,
} from '@aedifex/core'
import {
  commitParametricNodeFields,
  getNodePanelModel,
  applyMultiHeightMode,
  commitMultiNodeFields,
  fieldVisibleForAll,
  reduceFieldValue,
  reduceHeightBoundMode,
  resolveUniqueSelectionIds,
  resolveHomogeneousSelection,
  cycleSnappingModeIn,
  emitDeleteSFX,
  getHistoryCommandState,
  getSnappingModeLabel,
  runRedo,
  runUndo,
  subscribeHistoryCommandState,
  useEditor,
  useInteractionScope,
  usePanelToolHints,
  PALETTE_COLORS,
} from '@aedifex/editor'
import { useViewer } from '@aedifex/viewer'
import { useXR } from '@react-three/xr'
import { requestGodScaleReset } from '../../../../xr/god-mode'
import { toggleXRPlayerMode, useXRPlayerMode, XR_PLAYER_MODES } from '../../../../xr/mode-switching'
import {
  getPage,
  useXRWandPanelSettings,
  XR_WAND_PANEL_SCALE_MAX,
  XR_WAND_PANEL_SCALE_MIN,
  XR_WAND_PANEL_SCALE_STEP,
  type XRWandSettingRow,
  type XRWandSettingsModel,
} from '../../../../xr/wand'
import { useMemo, useSyncExternalStore } from 'react'
import {
  collectXRSettingRows,
  createXRSettingPatch,
  readXRSettingValue,
  resolveXRSettingsContext,
  type XRSettingFieldRow,
  type XRSettingRow,
  type XRSettingsContext,
} from './settings-descriptors'
import type { AedifexXRWandBindings } from '../bindings'
import { useAedifexXRWandTerrainModel } from './terrain-model'

import { nestedSettingsRows } from './nested-settings'
import { linkedSettingsRows } from './linked-settings'
import { resolveSettingsHierarchy } from './settings-hierarchy'
import type { XRWandSettingsOptions } from '../../../../xr/wand/adapter'

const ROWS_PER_PAGE = 5
const DEFAULT_SETTINGS_CONTEXT_KEY = 'default-settings'

function cycleOption(options: readonly unknown[], current: unknown, direction: -1 | 1) {
  if (options.length === 0) return undefined
  const index = options.indexOf(current)
  const base = index < 0 ? (direction === 1 ? -1 : 0) : index
  return options[(base + direction + options.length) % options.length]
}

function formatValue(value: unknown) {
  if (typeof value === 'string') return value || 'None'
  if (typeof value === 'boolean') return value ? 'On' : 'Off'
  if (typeof value === 'number') return String(Number(value.toFixed(3)))
  return value == null ? 'None' : 'Assigned'
}

function fieldModel({
  context,
  materials,
  onChange,
  referenceNodes,
  row,
}: {
  context: XRSettingsContext
  materials: ReturnType<typeof getMaterialsForCategory>
  onChange: (row: XRSettingFieldRow, value: unknown) => void
  referenceNodes: AnyNode[]
  row: XRSettingFieldRow
}): XRWandSettingRow {
  let value = readXRSettingValue(context, row)
  if (value == null) {
    const defaults = context.definition.defaults() as Record<string, unknown>
    const fallback = defaults[String(row.field.key)]
    value = row.axis == null ? fallback : Array.isArray(fallback) ? fallback[row.axis] : undefined
  }
  const id = `${String(row.field.key)}${row.axis == null ? '' : `-${row.axis}`}`

  if (row.field.kind === 'number' || row.field.kind === 'vec3') {
    const min = row.field.kind === 'number' ? (row.field.min ?? -Infinity) : -Infinity
    const max = row.field.kind === 'number' ? (row.field.max ?? Infinity) : Infinity
    return {
      id,
      kind: 'stepper',
      label: row.label,
      max,
      min,
      onChange: (next) => onChange(row, next),
      step: row.field.kind === 'number' ? (row.field.step ?? 0.01) : 0.05,
      unit: row.field.kind === 'number' ? row.field.unit : undefined,
      value: Math.max(min, Math.min(max, typeof value === 'number' ? value : Math.max(0, min))),
    }
  }
  if (row.field.kind === 'boolean') {
    return {
      id,
      kind: 'choice',
      label: row.label,
      onSelect: () => onChange(row, value !== true),
      value: value === true ? 'On' : 'Off',
    }
  }
  if (row.field.kind === 'custom') {
    return { id, kind: 'choice', label: row.label, value: 'Custom editor' }
  }

  let options: readonly unknown[] = []
  let displayValue = formatValue(value)
  let mapValue = (next: unknown) => next
  if (row.field.kind === 'enum') options = row.field.options
  if (row.field.kind === 'color') options = PALETTE_COLORS
  if (row.field.kind === 'material') {
    options = [null, ...materials.map((material) => material.id)]
    const selectedId = getLibraryMaterialIdFromRef(value as never)
    displayValue = materials.find((material) => material.id === selectedId)?.label ?? 'Default'
    mapValue = (next) => next === null ? undefined : toLibraryMaterialRef(String(next))
    value = selectedId
  }
  if (row.field.kind === 'ref') {
    const refKind = row.field.refKind
    const references = referenceNodes.filter((node) => node.type === refKind)
    options = [null, ...references.map((node) => node.id)]
    const selected = references.find((node) => node.id === value)
    displayValue = selected ? String(selected.name || selected.type) : 'None'
  }
  const change = (direction: -1 | 1) => {
    const next = cycleOption(options, value, direction)
    if (next !== undefined) onChange(row, mapValue(next))
  }
  return {
    id,
    kind: 'cycle',
    label: row.label,
    next: () => change(1),
    previous: () => change(-1),
    value: displayValue,
  }
}

function registryRowModel(
  row: XRSettingRow,
  context: XRSettingsContext,
  materials: ReturnType<typeof getMaterialsForCategory>,
  referenceNodes: AnyNode[],
  update: (row: XRSettingFieldRow, value: unknown) => void,
): XRWandSettingRow {
  if (row.kind === 'field') {
    return fieldModel({
      context,
      materials,
      onChange: update,
      referenceNodes,
      row,
    })
  }
  if (row.kind === 'action') {
    return {
      disabled: row.action.enabledIf ? !row.action.enabledIf(context.node) : false,
      id: `action-${row.id}`,
      icon: row.icon ?? (row.action.iconSrc ? { src: row.action.iconSrc } : undefined),
      kind: 'action',
      label: row.label,
      onSelect: () => {
        const node = useScene.getState().nodes[context.node.id as AnyNodeId]
        if (node && (!row.action.enabledIf || row.action.enabledIf(node))) row.action.onClick(node)
      },
    }
  }
  const { chip } = row.hint
  return {
    getValue: () => {
      const value = chip.value()
      return chip.labels[value] ?? value
    },
    id: row.id,
    kind: 'subscribed-choice',
    label: row.label,
    onSelect: chip.cycle,
    subscribe: chip.subscribe,
  }
}

export function useAedifexXRWandSettingsModel(
  bindings: AedifexXRWandBindings,
  options?: XRWandSettingsOptions,
): XRWandSettingsModel {
  const pageSize = options?.pageSize ?? ROWS_PER_PAGE
  const session = useXR((state) => state.session)
  const terrainModel = useAedifexXRWandTerrainModel()
  const paginationKey = useXRWandPanelSettings((state) => state.settingsContextKey)
  const paginationPage = useXRWandPanelSettings((state) => state.settingsPage)
  const setSettingsNavigation = useXRWandPanelSettings((state) => state.setSettingsNavigation)
  const panelScale = useXRWandPanelSettings((state) => state.panelScale)
  const setPanelScale = useXRWandPanelSettings((state) => state.setPanelScale)
  const mode = useEditor((state) => state.mode)
  const tool = useEditor((state) => state.tool)
  const toolDefaults = useEditor((state) =>
    state.tool ? state.toolDefaults[state.tool] : undefined,
  )
  const setToolDefaults = useEditor((state) => state.setToolDefaults)
  const gridSnapStep = useEditor((state) => state.gridSnapStep)
  const cycleGridSnapStep = useEditor((state) => state.cycleGridSnapStep)
  const wallSnappingMode = useEditor((state) => state.snappingModeByContext.wall)
  const polygonSnappingMode = useEditor((state) => state.snappingModeByContext.polygon)
  const itemSnappingMode = useEditor((state) => state.snappingModeByContext.item)
  const setSnappingMode = useEditor((state) => state.setSnappingMode)
  const interactionIdle = useInteractionScope((state) => state.scope.kind === 'idle')
  const playerMode = useXRPlayerMode((state) => state.mode)
  const selection = useViewer((state) => state.selection)
  const setSelection = useViewer((state) => state.setSelection)
  const nodes = useScene((state) => state.nodes)
  const createNode = useScene((state) => state.createNode)
  const deleteNode = useScene((state) => state.deleteNode)
  const selectedId = selection.selectedIds.length === 1 ? selection.selectedIds[0] : undefined
  const selectedNode = selectedId ? nodes[selectedId as AnyNodeId] : undefined
  const multiIds = resolveUniqueSelectionIds(selection.selectedIds, nodes)
  const materialVersion = useSyncExternalStore(
    subscribeLibraryMaterials,
    getLibraryMaterialsVersion,
    getLibraryMaterialsVersion,
  )
  const canUndo = useSyncExternalStore(
    subscribeHistoryCommandState,
    () => getHistoryCommandState().canUndo,
    () => false,
  )
  const canRedo = useSyncExternalStore(
    subscribeHistoryCommandState,
    () => getHistoryCommandState().canRedo,
    () => false,
  )
  const registryVersion = useRegistryVersion()
  const materials = useMemo(() => {
    void materialVersion
    return MATERIAL_CATEGORIES.flatMap((category) => getMaterialsForCategory(category))
  }, [materialVersion])
  const referenceNodes = useMemo(() => Object.values(nodes).filter(Boolean) as AnyNode[], [nodes])
  const context = useMemo(
    () =>
      resolveXRSettingsContext({
        mode: options?.scope === 'selection' ? 'select' : mode,
        selectedNode,
        tool,
        toolDefaults,
      }),
    [mode, selectedNode, tool, toolDefaults, options?.scope, registryVersion],
  )
  const visibleToolHints = usePanelToolHints(context?.source === 'tool' ? context.tool : null)
  const toolOptions = bindings.useToolOptions()
  const toolRows: XRWandSettingRow[] = (context?.source === 'tool' ? toolOptions : []).map((option) => {
    const change = (direction: -1 | 1) => {
      const choices = option.choices.map((choice) => choice.value)
      const value = cycleOption(choices, option.value, direction)
      if (typeof value === 'string') option.set(value)
    }
    return {
      id: `tool-option-${option.id}`,
      section: 'Placement',
      kind: 'cycle',
      label: option.label,
      value: option.choices.find((choice) => choice.value === option.value)?.label ?? option.value,
      previous: () => change(-1),
      next: () => change(1),
    }
  })

  const resolvedBuildingId =
    selection.buildingId && nodes[selection.buildingId]?.type === 'building'
      ? selection.buildingId
      : (Object.values(nodes).find((node) => node?.type === 'building') as BuildingNode | undefined)
          ?.id
  const levels = useMemo(() => {
    const building = resolvedBuildingId ? nodes[resolvedBuildingId] : undefined
    if (building?.type !== 'building') return [] as LevelNode[]
    return building.children
      .map((id) => nodes[id])
      .filter((node): node is LevelNode => node?.type === 'level')
      .sort((a, b) => a.level - b.level)
  }, [nodes, resolvedBuildingId])
  const activeLevel = levels.find((level) => level.id === selection.levelId) ?? levels[0]

  if (options?.scope !== 'workspace' && options?.scope !== 'selection' && mode === 'terrain-sculpt')
    return { ...terrainModel, contextual: true }

  const deleteSelectedNode = () => {
    if (!(selectedId && selectedNode && context?.source === 'node')) return
    if (context.definition.capabilities.deletable === false) return
    emitDeleteSFX(selectedNode.type)
    setSelection({ selectedIds: [] })
    if (selectedNode.type === 'downspout') {
      const gutter = useScene.getState().nodes[selectedNode.gutterId as AnyNodeId]
      if (gutter?.type === 'gutter') {
        useScene.getState().applyNodeChanges({ update: [{ id: gutter.id, data: { outlets: gutter.outlets.filter(outlet => outlet.id !== selectedNode.outletId) } }], delete: [selectedNode.id] })
        return
      }
    }
    deleteNode(selectedId as AnyNodeId)
  }
  const update = (row: XRSettingFieldRow, value: unknown) => {
    if (!context) return
    const patch = createXRSettingPatch(context, row, value)
    if (context.source === 'node') {
      commitParametricNodeFields(context.node.id as AnyNodeId, patch)
    } else if (context.tool) {
      setToolDefaults(context.tool, { ...toolDefaults, ...patch })
    }
  }

  const withHierarchy = (rows: XRWandSettingRow[]): XRWandSettingRow[] => {
    if (context?.source !== 'node') return rows
    const hierarchy = resolveSettingsHierarchy(context.node, nodes)
    const selectNode = (id: string) => {
      if (useScene.getState().nodes[id as AnyNodeId]) setSelection({ selectedIds: [id as AnyNodeId] })
    }
    const labelFor = (node: AnyNode) => node.name || nodeRegistry.get(node.type)?.presentation?.label || node.type
    const existing = new Set(rows.map((row) => row.id))
    const navigation: XRWandSettingRow[] = hierarchy.parent ? [{
      id: 'inspector-parent', kind: 'action', section: 'Navigation',
      label: `Back to ${labelFor(hierarchy.parent)}`,
      onSelect: () => selectNode(hierarchy.parent!.id),
    }] : []
    const children: XRWandSettingRow[] = hierarchy.children
      .filter((child) => !existing.has(child.id))
      .map((child) => ({
        id: child.id, kind: 'action',
        section: child.type === 'roof-segment' || child.type === 'stair-segment' ? 'Segments' : child.type === 'downspout' ? 'Downspouts' : child.type === 'window' && context.node.type === 'dormer' ? 'Windows' : 'Hosted items',
        label: labelFor(child),
        onSelect: () => selectNode(child.id),
      }))
    const api = {
      read: () => useScene.getState().nodes[context.node.id],
      update: (patch: Record<string, unknown>) => {
        const current = useScene.getState().nodes[context.node.id]
        if (!current) return
        commitParametricNodeFields(context.node.id, patch)
        if (current.type === 'cabinet-module' && 'stack' in patch) {
          let parent = current.parentId ? useScene.getState().nodes[current.parentId as AnyNodeId] : undefined
          const visited = new Set<string>()
          while (parent && !visited.has(parent.id)) {
            visited.add(parent.id)
            if (parent.type === 'cabinet') {
              const metadata = parent.metadata && typeof parent.metadata === 'object' && !Array.isArray(parent.metadata) ? parent.metadata : {}
              const revision = typeof metadata.cabinetLayoutRevision === 'number' ? metadata.cabinetLayoutRevision : 0
              useScene.getState().updateNode(parent.id, { metadata: { ...metadata, cabinetLayoutRevision: revision + 1 } })
              break
            }
            parent = parent.parentId ? useScene.getState().nodes[parent.parentId as AnyNodeId] : undefined
          }
        }
      },
      select: selectNode,
      create: (type: string, values: Record<string, unknown>, parentId: string) => {
        const definition = nodeRegistry.get(type)
        if (!definition || !useScene.getState().nodes[parentId as AnyNodeId]) return
        const child = definition.schema.parse({ ...definition.defaults(), ...values, type }) as AnyNode
        useScene.getState().createNode(child, parentId as AnyNodeId)
        selectNode(child.id)
      },
      remove: (id: string) => useScene.getState().deleteNode(id as AnyNodeId),
      nodes, materials,
    }
    return [...navigation, ...children, ...nestedSettingsRows(context.node, api), ...linkedSettingsRows(context.node, api), ...rows]
  }

  if (options?.scope !== 'workspace' && multiIds.length > 1) {
    const type = resolveHomogeneousSelection(multiIds, nodes)
    const first = nodes[multiIds[0]!]
    const multiContext = type && first ? resolveXRSettingsContext({ mode: 'select', tool: null, selectedNode: first }) : null
    const rows: XRWandSettingRow[] = []
    if (multiContext?.definition.parametrics) {
      const parametrics = multiContext.definition.parametrics as ParametricDescriptor<AnyNode>
      const heightMode = reduceHeightBoundMode(multiIds, nodes)
      for (const row of collectXRSettingRows(multiContext)) {
        if (row.kind !== 'field' || row.field.kind === 'custom' || !fieldVisibleForAll(multiIds, row.field.visibleIf, nodes)) continue
        if (String(row.field.key) === 'height' && (type === 'wall' || type === 'ceiling')) {
          rows.push({ id: 'height-mode', section: row.group, kind: 'choice', label: 'Top',
            value: heightMode.kind === 'mixed' ? 'Mixed' : heightMode.value === 'storey' ? 'Follows level' : 'Custom height',
            onSelect: () => applyMultiHeightMode(multiIds, heightMode.kind === 'same' && heightMode.value === 'custom' ? 'storey' : 'custom', parametrics),
          })
          if (heightMode.kind !== 'same' || heightMode.value !== 'custom') continue
        }
        const reduced = reduceFieldValue(multiIds, String(row.field.key), nodes)
        const control = fieldModel({ context: multiContext, row, materials, referenceNodes,
          onChange: (field, value) => commitMultiNodeFields(multiIds, (node) => createXRSettingPatch({ ...multiContext, node }, field, value), parametrics),
        })
        rows.push({ ...control, section: row.group, mixed: reduced.kind === 'mixed' })
      }
    }
    return { contextual: true, contextKey: `selection:${multiIds.join(',')}`, title: `${multiIds.length} selected`,
      mark: type ?? 'Mixed types', rows, page: 0, pageCount: 1,
      onClearSelection: () => setSelection({ selectedIds: [] }),
      emptyMessage: 'This selection has no shared editable properties.',
      onDelete: multiIds.every((id) => nodeRegistry.get(nodes[id]!.type)?.capabilities.deletable !== false)
        ? () => { useScene.getState().deleteNodes(multiIds); setSelection({ selectedIds: [] }) } : undefined,
    }
  }

  if (
    options?.scope !== 'workspace' &&
    context?.source === 'node' &&
    getNodePanelModel(context.definition)
  ) {
    const rows = withHierarchy(getNodePanelModel(context.definition)!.rows({
      node: context.node, nodes,
      update: (patch) => commitParametricNodeFields(context.node.id, patch),
    }))
    const current = options?.unpaged
      ? { currentPage: 0, pageCount: 1, items: rows }
      : getPage(rows, paginationKey === context.key ? paginationPage : 0, pageSize)
    return {
      contextKey: context.key,
      contextual: true,
      title: context.node.name || context.title,
      mark: `${rows.length} controls`,
      onClearSelection: () => setSelection({ selectedIds: [] }),
      onDelete: deleteSelectedNode,
      rows: current.items,
      page: current.currentPage,
      pageCount: current.pageCount,
      onPageChange: (page) => setSettingsNavigation(context.key, page),
    }
  }


  if (options?.scope !== 'workspace' && context) {
    const sourceRows = [
      ...collectXRSettingRows(context, visibleToolHints).filter(row => !(context.node.type === 'downspout' && row.kind === 'field' && row.field.kind === 'custom')),
    ]
    const key = context.key
    const page = paginationKey === key ? paginationPage : 0
    const rows: XRWandSettingRow[] = withHierarchy([
      ...toolRows,
      ...sourceRows.map((row) => ({
        ...registryRowModel(row, context, materials, referenceNodes, update),
        section: row.kind === 'field' ? row.group : 'Actions',
      })),
    ])
    const current = options?.unpaged
      ? { currentPage: 0, pageCount: 1, items: rows }
      : getPage(rows, page, pageSize)
    return {
      contextKey: context.key,
      onClearSelection:
        context.source === 'node' ? () => setSelection({ selectedIds: [] }) : undefined,
      contextual: true,
      emptyMessage: 'No spatial settings are exposed for this item yet.',
      mark: `${rows.length} controls`,
      onDelete:
        context.source === 'node' && context.definition.capabilities.deletable !== false
          ? deleteSelectedNode
          : undefined,
      onPageChange: (nextPage) => setSettingsNavigation(key, nextPage),
      page: current.currentPage,
      pageCount: current.pageCount,
      rows: current.items,
      title: context.title,
    }
  }

  const cycleFloor = () => {
    if (!activeLevel) return
    const index = levels.findIndex((level) => level.id === activeLevel.id)
    const next = levels[(index + 1) % levels.length]
    if (next) setSelection({ buildingId: resolvedBuildingId, levelId: next.id })
  }
  const addFloorAt = (level: number) => {
    if (!resolvedBuildingId) return
    const newLevel = LevelNode.parse({
      level,
      height: DEFAULT_LEVEL_HEIGHT,
      children: [],
      parentId: resolvedBuildingId,
    })
    createNode(newLevel, resolvedBuildingId as AnyNodeId)
    setSelection({ buildingId: resolvedBuildingId, levelId: newLevel.id })
  }
  const removeFloor = () => {
    if (!(activeLevel && activeLevel.level !== 0)) return
    const index = levels.findIndex((level) => level.id === activeLevel.id)
    const fallback = levels[index - 1] ?? levels[index + 1]
    deleteNode(activeLevel.id)
    setSelection({
      buildingId: resolvedBuildingId,
      levelId: fallback?.id ?? null,
    })
  }
  const page = paginationKey === DEFAULT_SETTINGS_CONTEXT_KEY ? paginationPage : 0
  const rows: XRWandSettingRow[] = [
    {
      id: 'floor',
      kind: 'choice',
      label: 'Floor',
      onSelect: levels.length ? cycleFloor : undefined,
      value: activeLevel ? getLevelDisplayName(activeLevel) : 'No floors',
    },
    {
      actions: [
        {
          id: 'add-floor',
          disabled: !resolvedBuildingId,
          label: 'Add floor',
          onSelect: () =>
            addFloorAt(levels.length ? Math.max(...levels.map((entry) => entry.level)) + 1 : 0),
        },
        {
          id: 'add-basement',
          disabled: !resolvedBuildingId,
          label: 'Add basement',
          onSelect: () =>
            addFloorAt(levels.length ? Math.min(...levels.map((entry) => entry.level)) - 1 : -1),
        },
      ],
      id: 'floor-actions',
      kind: 'actions',
    },
    {
      disabled: !activeLevel || activeLevel.level === 0,
      id: 'remove-floor',
      kind: 'action',
      label: 'Remove selected floor',
      onSelect: removeFloor,
    },
    {
      id: 'editor-mode',
      kind: 'choice',
      label: 'Editor mode',
      value: mode,
    },
    {
      id: 'grid-snap',
      kind: 'choice',
      label: 'Grid snap',
      onSelect: cycleGridSnapStep,
      value: `${gridSnapStep} m`,
    },
    {
      id: 'player-mode',
      kind: 'choice',
      label: 'XR scale',
      onSelect: toggleXRPlayerMode,
      value: playerMode === XR_PLAYER_MODES.GOD ? 'God' : 'Human',
    },
    {
      id: 'panel-scale',
      kind: 'stepper',
      label: 'Panel size',
      max: XR_WAND_PANEL_SCALE_MAX,
      min: XR_WAND_PANEL_SCALE_MIN,
      onChange: setPanelScale,
      step: XR_WAND_PANEL_SCALE_STEP,
      value: panelScale,
    },
    {
      id: 'wall-snap',
      kind: 'choice',
      label: 'Wall snap',
      onSelect: () => setSnappingMode('wall', cycleSnappingModeIn('wall', wallSnappingMode)),
      value: getSnappingModeLabel(wallSnappingMode),
    },
    {
      id: 'polygon-snap',
      kind: 'choice',
      label: 'Move / surface snap',
      onSelect: () => setSnappingMode('polygon', cycleSnappingModeIn('polygon', polygonSnappingMode)),
      value: getSnappingModeLabel(polygonSnappingMode),
    },
    {
      id: 'item-snap',
      kind: 'choice',
      label: 'Item snap',
      onSelect: () => setSnappingMode('item', cycleSnappingModeIn('item', itemSnappingMode)),
      value: getSnappingModeLabel(itemSnappingMode),
    },
    {
      id: 'exit-vr',
      kind: 'action',
      label: 'Exit VR',
      onSelect: () => {
        void session?.end().catch(console.error)
      },
    },
  ]

  return {
    headerActions: [
      {
        disabled: !canUndo || !interactionIdle,
        id: 'undo',
        label: 'Undo',
        onSelect: runUndo,
      },
      {
        disabled: !canRedo || !interactionIdle,
        id: 'redo',
        label: 'Redo',
        onSelect: runRedo,
      },
      {
        disabled: playerMode !== XR_PLAYER_MODES.GOD || !interactionIdle,
        id: 'reset-view',
        label: 'Reset view',
        onSelect: requestGodScaleReset,
      },
    ],
    contextKey: DEFAULT_SETTINGS_CONTEXT_KEY,
    mark:
      selection.selectedIds.length > 1 ? `${selection.selectedIds.length} selected` : 'Workspace',
    onPageChange: (nextPage) => setSettingsNavigation(DEFAULT_SETTINGS_CONTEXT_KEY, nextPage),
    page: options?.unpaged ? 0 : getPage(rows, page, pageSize).currentPage,
    pageCount: options?.unpaged ? 1 : getPage(rows, page, pageSize).pageCount,
    rows: (options?.unpaged ? rows : getPage(rows, page, pageSize).items).map((row) => ({
      ...row,
      section: ['floor', 'floor-actions', 'remove-floor'].includes(row.id) ? 'Floors' : 'Workspace',
    })),
    title: 'Settings',
  }
}
