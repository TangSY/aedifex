import {
  type AnyNode, type AnyNodeId, createSceneApi, nodeRegistry, computeGutterEaveY, createDefaultRidgeVentsForSegment,
  createDormerDefaultWindow, DownspoutNode, generateId, isAutoGutterEnabled,
  isAutoRidgeVentEnabled, isDefaultRidgeVentNode, normalizeRoofSegmentTrim,
  resolveElevatorServiceLevels, useScene, WindowNode,
} from '@aedifex/core'
import type { XRWandSettingRow } from '../../../../xr/wand/adapter'
import type { NestedSettingsAPI } from './nested-settings'

export function linkedSettingsRows(node: AnyNode, api: NestedSettingsAPI): XRWandSettingRow[] {
  const rows: XRWandSettingRow[] = []
  const action = (id: string, section: string, label: string, onSelect: () => void, disabled = false) => rows.push({ id: `linked-${id}`, kind: 'action', section, label, onSelect: () => { if (!disabled) onSelect() }, disabled })
  const toggle = (id: string, section: string, label: string, value: boolean, change: (value: boolean) => void) => rows.push({ id: `linked-${id}`, section, kind: 'choice', label, value: value ? 'On' : 'Off', onSelect: () => change(!value) })
  if (node.type === 'cabinet' || node.type === 'cabinet-module') {
    for (const entry of nodeRegistry.get(node.type)?.quickActions?.({ node, nodes: api.nodes }) ?? []) {
      action(`cabinet-${entry.id}`, 'Cabinet layout', entry.label, () => {
        const current = api.read()
        if (!current) return
        const latest = nodeRegistry.get(current.type)?.quickActions?.({ node: current, nodes: useScene.getState().nodes }).find(action => action.id === entry.id)
        if (!latest || latest.disabled) return
        const result = latest.run({ node: current, sceneApi: createSceneApi(useScene) })
        if (result?.selectedIds?.[0]) api.select(result.selectedIds[0])
      }, entry.disabled)
    }
  }
  if (node.type === 'roof-segment') {
    const trim = normalizeRoofSegmentTrim(node)
    for (const key of Object.keys(trim) as (keyof typeof trim)[]) {
      rows.push({ id: `linked-trim-${key}`, section: 'Trim', kind: 'stepper', label: key, value: trim[key], min: 0, max: Math.max(node.width, node.depth), step: 0.05, onChange: value => {
        const current = api.read()
        if (current?.type === 'roof-segment' && Number.isFinite(value)) api.update({ trim: normalizeRoofSegmentTrim({ ...current, trim: { ...current.trim, [key]: Math.max(0, value) } }) })
      } })
    }
    action('reset-trim', 'Trim', 'Reset trim', () => {
      const current = api.read()
      if (current?.type === 'roof-segment') api.update({ trim: Object.fromEntries(Object.keys(trim).map(key => [key, 0])) })
    })
    toggle('gutters', 'Drainage', 'Automatic gutters', isAutoGutterEnabled(node, api.nodes as Record<AnyNodeId, AnyNode>), enabled => {
      const current = api.read()
      if (current?.type === 'roof-segment') api.update({ metadata: { ...(current.metadata && typeof current.metadata === 'object' ? current.metadata : {}), autoGutter: enabled } })
    })
    toggle('ridge-vent', 'Drainage', 'Automatic ridge vent', isAutoRidgeVentEnabled(node, api.nodes as Record<AnyNodeId, AnyNode>), enabled => {
      const current = api.read()
      if (current?.type !== 'roof-segment') return
      api.update({ metadata: { ...(current.metadata && typeof current.metadata === 'object' ? current.metadata : {}), autoRidgeVent: enabled } })
      const scene = useScene.getState()
      const existing = current.children.filter(id => isDefaultRidgeVentNode(scene.nodes[id as AnyNodeId], current.id))
      if (!enabled) scene.deleteNodes(existing as AnyNodeId[])
      else if (!existing.length) scene.createNodes(createDefaultRidgeVentsForSegment(current).map(node => ({ node, parentId: current.id })))
    })
  }
  if (node.type === 'elevator') {
    const levels = resolveElevatorServiceLevels(node, api.nodes as Record<AnyNodeId, AnyNode>)
    for (const level of levels) {
      const disabled = node.disabledLevelIds.includes(level.id)
      const service = node.serviceOnlyLevelIds.includes(level.id)
      const values = ['Public', 'Service only', 'Disabled']
      const value = disabled ? 'Disabled' : service ? 'Service only' : 'Public'
      const change = (offset: number) => {
        const current = api.read()
        if (current?.type !== 'elevator') return
        const next = values[(values.indexOf(value) + offset + 3) % 3]
        api.update({ disabledLevelIds: [...current.disabledLevelIds.filter(id => id !== level.id), ...(next === 'Disabled' ? [level.id] : [])], serviceOnlyLevelIds: [...current.serviceOnlyLevelIds.filter(id => id !== level.id), ...(next === 'Service only' ? [level.id] : [])] })
      }
      rows.push({ id: `linked-level-${level.id}`, section: 'Service levels', kind: 'cycle', label: level.name || `Level ${level.level}`, value, previous: () => change(-1), next: () => change(1) })
    }
  }
  if (node.type === 'gutter') {
    action('downspout-add', 'Downspouts', 'Add downspout', () => {
      const current = api.read()
      if (current?.type !== 'gutter') return
      const scene = useScene.getState()
      const segment = scene.nodes[current.roofSegmentId as AnyNodeId]
      if (segment?.type !== 'roof-segment') return
      const lo = -current.length / 2 + 0.12, hi = current.length / 2 - 0.12
      const positions = (current.outlets ?? []).map(outlet => Math.max(lo, Math.min(hi, outlet.offset))).sort((a, b) => a - b)
      const bounds = [lo, ...positions, hi]
      let offset = hi, gap = -1
      if (positions.length) for (let i = 1; i < bounds.length; i++) {
        const size = bounds[i]! - bounds[i - 1]!
        if (size > gap) { gap = size; offset = (bounds[i]! + bounds[i - 1]!) / 2 }
      }
      const outletId = generateId('outlet')
      const downspout = DownspoutNode.parse({ name: 'Downspout', gutterId: current.id, outletId, length: Math.max(0.1, computeGutterEaveY(segment) - current.size), diameter: 0.07 })
      scene.applyNodeChanges({ update: [{ id: current.id, data: { outlets: [...current.outlets, { id: outletId, offset: hi <= lo ? 0 : offset, diameter: 0.07 }] } }], create: [{ node: downspout, parentId: segment.id }] })
      api.select(downspout.id)
    }, !node.roofSegmentId || node.length < 0.1)
    for (const downspout of Object.values(api.nodes)) if (downspout?.type === 'downspout' && downspout.gutterId === node.id) {
      action(`downspout-${downspout.id}-remove`, 'Downspouts', `Remove ${downspout.name || 'downspout'}`, () => {
        const current = api.read()
        if (current?.type !== 'gutter') return
        useScene.getState().applyNodeChanges({ update: [{ id: current.id, data: { outlets: current.outlets.filter(outlet => outlet.id !== downspout.outletId) } }], delete: [downspout.id] })
      })
    }
  }
  if (node.type === 'downspout') {
    const gutter = api.nodes[node.gutterId ?? '']
    if (gutter?.type === 'gutter') {
      const outlet = gutter.outlets.find(entry => entry.id === node.outletId)
      if (outlet) rows.push({ id: 'linked-outlet-position', kind: 'stepper', section: 'Placement', label: 'Along gutter', value: outlet.offset, min: -gutter.length / 2 + 0.05, max: gutter.length / 2 - 0.05, step: 0.05, onChange: value => {
        const current = useScene.getState().nodes[gutter.id]
        if (current?.type === 'gutter') useScene.getState().updateNode(current.id, { outlets: current.outlets.map(entry => entry.id === outlet.id ? { ...entry, offset: Math.max(-current.length / 2 + 0.05, Math.min(current.length / 2 - 0.05, value)) } : entry) })
      } })
    }
  }
  if (node.type === 'dormer') {
    const windows = Object.values(api.nodes).filter((child): child is WindowNode => child?.type === 'window' && (child.dormerId === node.id || child.parentId === node.id) && (child.dormerFace ?? 'front') === 'front')
    action('window-add', 'Windows', 'Add window', () => {
      const current = api.read()
      if (current?.type !== 'dormer') return
      const scene = useScene.getState()
      const existing = Object.values(scene.nodes).filter((child): child is WindowNode => child?.type === 'window' && (child.dormerId === current.id || child.parentId === current.id) && (child.dormerFace ?? 'front') === 'front')
      const count = existing.length + 1
      const width = Math.min(1.2, (current.width - 0.24 - 0.12 * (count - 1)) / count)
      if (width < 0.3) return
      const child = WindowNode.parse({ ...createDormerDefaultWindow(current, generateId('window')), name: `Window ${count}`, width })
      const start = -(width * count + 0.12 * (count - 1)) / 2 + width / 2
      child.position[0] = start + (count - 1) * (width + 0.12)
      scene.applyNodeChanges({ create: [{ node: child, parentId: current.id }], update: existing.map((entry, i) => ({ id: entry.id, data: { width, position: [start + i * (width + 0.12), entry.position[1], entry.position[2]] } })) })
      api.select(child.id)
    }, node.width < 0.24 + (windows.length + 1) * 0.3 + windows.length * 0.12)
  }
  return rows
}
