import type { AnyNode, CabinetNode } from '@aedifex/core'
import type { XRWandSettingRow } from '../../../../xr/wand/adapter'

type CabinetCompartmentSchema = NonNullable<CabinetNode['stack']>[number]

export type NestedSettingsAPI = {
  read: () => AnyNode | undefined
  update: (patch: Record<string, unknown>) => void
  select: (id: string) => void
  create: (type: string, values: Record<string, unknown>, parentId: string) => void
  remove: (id: string) => void
  nodes: Readonly<Record<string, AnyNode | undefined>>
  materials: readonly { id: string; label: string }[]
}

export function redistributeRatios(values: readonly number[], index: number, ratio: number): number[] {
  if (values.length <= 1) return values.map(() => 1)
  const next = Math.max(0.05, Math.min(0.95, ratio))
  const remaining = values.reduce((sum, value, i) => sum + (i === index ? 0 : value), 0)
  return values.map((value, i) => i === index ? next : remaining > 0 ? value / remaining * (1 - next) : (1 - next) / (values.length - 1))
}

export function cabinetStack(node: Pick<CabinetNode, 'width' | 'stack'> & { id: string }): CabinetCompartmentSchema[] {
  return node.stack?.length ? node.stack : [{ id: `${node.id}-default`, type: 'door', doorType: node.width > 0.5 ? 'double' : 'single-left', shelfCount: 1 }]
}

const compartmentTypes: CabinetCompartmentSchema['type'][] = ['shelf', 'drawer', 'door', 'sink', 'oven', 'microwave', 'dishwasher', 'cooktop-gas', 'cooktop-induction', 'pull-out-pantry', 'fridge-single', 'fridge-double', 'fridge-top-freezer', 'fridge-bottom-freezer', 'hood-pyramid', 'hood-curved-glass']

export function nestedSettingsRows(node: AnyNode, api: NestedSettingsAPI): XRWandSettingRow[] {
  const rows: XRWandSettingRow[] = []
  let section = 'Details'
  const number = (id: string, label: string, value: number, min: number, max: number, step: number, change: (value: number) => void) => {
    rows.push({ id: `nested-${id}`, section, kind: 'stepper', label, value, min, max, step,
      onChange: value => { if (Number.isFinite(value)) change(Math.max(min, Math.min(max, step === 1 ? Math.round(value) : value))) } })
  }
  const action = (id: string, label: string, onSelect: () => void, disabled = false) => rows.push({ id: `nested-${id}`, section, kind: 'action', label, onSelect: () => { if (!disabled) onSelect() }, disabled })
  const choice = (id: string, label: string, value: string, options: readonly string[], change: (value: string) => void) => {
    const cycle = (direction: number) => change(options[(options.indexOf(value) + direction + options.length) % options.length]!)
    rows.push({ id: `nested-${id}`, section, kind: 'cycle', label, value, previous: () => cycle(-1), next: () => cycle(1) })
  }
  const toggle = (id: string, label: string, value: boolean, change: (value: boolean) => void) => {
    rows.push({ id: `nested-${id}`, section, kind: 'choice', label, value: value ? 'On' : 'Off', onSelect: () => change(!value) })
  }
  const ratios = (id: string, label: string, values: number[], change: (transform: (values: number[]) => number[]) => void) => {
    number(`${id}-count`, `${label} count`, values.length, 1, 8, 1, count => change(() => Array(count).fill(1 / count)))
    const sum = values.reduce((a, b) => a + b, 0) || 1
    if (values.length > 1) values.forEach((value, i) => number(`${id}-${i}`, `${label} ${i + 1} %`, value / sum * 100, 5, 95, 1, next => change(current => redistributeRatios(current, i, next / 100))))
  }

  if (node.type === 'door' && node.openingKind !== 'opening' && !node.doorType.startsWith('garage')) {
    node.segments.forEach((segment, index) => {
      section = `Segment ${index + 1}`
      const edit = (patch: Record<string, unknown>) => {
        const current = api.read()
        if (current?.type === 'door' && current.segments[index]) api.update({ segments: current.segments.map((entry, i) => i === index ? { ...entry, ...patch } : entry) })
      }
      choice(`segment-${index}-type`, 'Fill', segment.type, ['panel', 'glass', 'empty'], type => edit({ type }))
      const sum = node.segments.reduce((total, entry) => total + entry.heightRatio, 0) || 1
      if (node.segments.length > 1) number(`segment-${index}-height`, 'Height %', segment.heightRatio / sum * 100, 5, 95, 1, value => {
        const current = api.read()
        if (current?.type !== 'door') return
        const heights = redistributeRatios(current.segments.map(entry => entry.heightRatio), index, value / 100)
        api.update({ segments: current.segments.map((entry, i) => ({ ...entry, heightRatio: heights[i] })) })
      })
      ratios(`segment-${index}-columns`, 'Column', segment.columnRatios, transform => {
        const current = api.read()
        if (current?.type === 'door' && current.segments[index]) edit({ columnRatios: transform(current.segments[index].columnRatios) })
      })
      number(`segment-${index}-divider`, 'Divider thickness', segment.dividerThickness, 0.005, 0.1, 0.005, value => edit({ dividerThickness: value }))
      if (segment.type === 'panel') {
        number(`segment-${index}-inset`, 'Panel inset', segment.panelInset, 0, 0.1, 0.005, value => edit({ panelInset: value }))
        number(`segment-${index}-depth`, 'Panel depth', segment.panelDepth, -0.1, 0.1, 0.005, value => edit({ panelDepth: value }))
      }
      action(`segment-${index}-remove`, 'Remove segment', () => {
        const current = api.read()
        if (current?.type === 'door' && current.segments.length > 1) api.update({ segments: current.segments.filter((_, i) => i !== index) })
      }, node.segments.length <= 1)
    })
    section = 'Segments'
    action('segment-add', 'Add segment', () => {
      const current = api.read()
      if (current?.type === 'door') api.update({ segments: [...current.segments, { type: 'panel', heightRatio: 0.5, columnRatios: [1], dividerThickness: 0.03, panelDepth: 0.01, panelInset: 0.04 }] })
    })
  }

  if (node.type === 'window' && node.openingKind !== 'opening') {
    section = 'Grid'
    for (const key of ['columnRatios', 'rowRatios'] as const) ratios(key, key === 'columnRatios' ? 'Column' : 'Row', node[key], transform => {
      const current = api.read()
      if (current?.type === 'window') api.update({ [key]: transform(current[key]) })
    })
    for (const key of ['columnDividerThickness', 'rowDividerThickness'] as const) number(key, key === 'columnDividerThickness' ? 'Column divider' : 'Row divider', node[key], 0.005, 0.1, 0.005, value => api.update({ [key]: value }))
  }

  if (node.type === 'cabinet' || node.type === 'cabinet-module') {
    const stack = cabinetStack(node)
    stack.forEach((entry, index) => {
      section = `Compartment ${index + 1}`
      const transform = (fn: (stack: CabinetCompartmentSchema[]) => CabinetCompartmentSchema[]) => {
        const current = api.read()
        if (current?.type === 'cabinet' || current?.type === 'cabinet-module') {
          const stack = fn(cabinetStack(current))
          const minimum = stack.reduce((sum, item) => sum + (item.type === 'sink' || item.type.startsWith('cooktop-') ? 0 : item.height ?? 0.1), 0)
          api.update({ stack, carcassHeight: Math.max(current.carcassHeight, minimum) })
        }
      }
      const edit = (patch: Record<string, unknown>) => transform(stack => stack.map(item => item.id === entry.id ? { ...item, ...patch } as CabinetCompartmentSchema : item))
      choice(`${entry.id}-type`, 'Type', entry.type, compartmentTypes, type => transform(stack => stack.map(item => item.id === entry.id ? { id: item.id, type, height: item.height } as CabinetCompartmentSchema : item)))
      number(`${entry.id}-height`, 'Height', entry.height ?? node.carcassHeight / Math.max(1, stack.length), 0.1, Math.max(0.1, 2.4 - stack.reduce((sum, item) => sum + (item.id === entry.id || item.type === 'sink' || item.type.startsWith('cooktop-') ? 0 : item.height ?? 0.1), 0)), 0.01, height => edit({ height }))
      action(`${entry.id}-auto-height`, 'Automatic height', () => edit({ height: undefined }))
      if (entry.type === 'shelf' || entry.type === 'door' || entry.type === 'pull-out-pantry') number(`${entry.id}-shelves`, 'Shelves', entry.shelfCount ?? 2, 0, 8, 1, shelfCount => edit({ shelfCount }))
      if (entry.type === 'drawer') number(`${entry.id}-drawers`, 'Drawers', entry.drawerCount ?? 1, 1, 6, 1, drawerCount => edit({ drawerCount }))
      if (entry.type === 'door') choice(`${entry.id}-doors`, 'Door style', entry.doorType ?? (node.width > 0.5 ? 'double' : 'single-left'), ['single-left', 'single-right', 'double', 'glass'], doorType => edit({ doorType }))
      if (entry.type === 'sink') choice(`${entry.id}-sink`, 'Bowls', entry.sinkLayout ?? 'single', ['single', 'double', 'double-offset'], sinkLayout => edit({ sinkLayout }))
      if (entry.type === 'pull-out-pantry') choice(`${entry.id}-rack`, 'Rack style', entry.pantryRackStyle ?? 'wire', ['wire', 'tray', 'glass'], pantryRackStyle => edit({ pantryRackStyle }))
      if (entry.type === 'cooktop-gas' || entry.type === 'cooktop-induction') {
        const gas = entry.type === 'cooktop-gas'
        choice(`${entry.id}-layout`, 'Layout', entry.cooktopLayout ?? (gas ? 'gas-5burner-wok' : 'induction-4zone'), gas ? ['gas-2burner', 'gas-4burner', 'gas-5burner-wok', 'gas-6burner'] : ['induction-2zone', 'induction-4zone'], cooktopLayout => edit({ cooktopLayout, cooktopActiveBurners: [], cooktopKnobProgress: [], cooktopBurnersOn: false }))
        toggle(`${entry.id}-burners`, 'Burners', entry.cooktopBurnersOn ?? false, on => {
          const count = Number((entry.cooktopLayout ?? (gas ? 'gas-5burner-wok' : 'induction-4zone')).match(/\d/)?.[0] ?? 4)
          edit({ cooktopBurnersOn: on, cooktopActiveBurners: on ? Array.from({ length: count }, (_, i) => i) : [], cooktopKnobProgress: Array(count).fill(on ? 1 : 0) })
        })
        if (gas) toggle(`${entry.id}-grate`, 'Top grate', entry.cooktopShowGrate ?? true, cooktopShowGrate => edit({ cooktopShowGrate }))
      }
      for (const direction of [-1, 1]) action(`${entry.id}-move-${direction}`, direction < 0 ? 'Move down' : 'Move up', () => transform(stack => {
        const i = stack.findIndex(item => item.id === entry.id)
        const j = i + direction
        if (i < 0 || j < 0 || j >= stack.length) return stack
        const next = [...stack]; [next[i], next[j]] = [next[j]!, next[i]!]; return next
      }), index + direction < 0 || index + direction >= stack.length)
      action(`${entry.id}-remove`, 'Remove compartment', () => transform(stack => stack.length > 1 ? stack.filter(item => item.id !== entry.id) : stack), stack.length <= 1)
    })
    section = 'Compartments'
    action('compartment-add', 'Add compartment', () => {
      const current = api.read()
      if (current?.type === 'cabinet' || current?.type === 'cabinet-module') api.update({ stack: [...cabinetStack(current), { id: crypto.randomUUID(), type: 'shelf', shelfCount: 1 }] })
    })
  }

  if (node.type === 'stair' && node.stairType === 'straight') {
    section = 'Segments'
    for (const landing of [false, true]) action(`stair-add-${landing}`, landing ? 'Add landing' : 'Add flight', () => {
      const current = api.read()
      if (current?.type !== 'stair') return
      const last = api.nodes[current.children.at(-1) ?? '']
      api.create('stair-segment', { segmentType: landing ? 'landing' : 'stair', width: 1, length: landing ? 1 : 3, height: landing ? 0 : 2.5, stepCount: landing ? 0 : 10, attachmentSide: 'front', fillToFloor: last?.type === 'stair-segment' ? last.fillToFloor : true, thickness: landing ? 0.32 : 0.25, position: [0, 0, 0] }, current.id)
    })
  }

  if (node.type === 'slab' || node.type === 'ceiling') {
    node.holes.forEach((hole, index) => {
      section = `Opening ${index + 1}`
      const metadata = node.holeMetadata[index]
      if (metadata && metadata.source !== 'manual') {
        rows.push({ id: `nested-hole-${index}-source`, section, kind: 'choice', label: 'Managed by', value: metadata.source })
        const sourceId = metadata.stairId ?? metadata.elevatorId
        if (sourceId) action(`hole-${index}-host`, 'Edit source', () => api.select(sourceId))
        return
      }
      const edit = (fn: (hole: [number, number][]) => [number, number][]) => {
        const current = api.read()
        if ((current?.type === 'slab' || current?.type === 'ceiling') && current.holes[index]) api.update({ holes: current.holes.map((entry, i) => i === index ? fn(entry) : entry) })
      }
      hole.forEach((point, vertex) => {
        for (const axis of [0, 1] as const) number(`hole-${index}-${vertex}-${axis}`, `Point ${vertex + 1} ${axis === 0 ? 'X' : 'Z'}`, point[axis], -1000, 1000, 0.05, value => edit(points => points.map((point, i) => i === vertex ? axis === 0 ? [value, point[1]] : [point[0], value] : point)))
        action(`hole-${index}-${vertex}-insert`, `Insert after point ${vertex + 1}`, () => edit(points => {
          const a = points[vertex], b = points[(vertex + 1) % points.length]
          if (!a || !b) return points
          const result = [...points]; result.splice(vertex + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]); return result
        }))
        action(`hole-${index}-${vertex}-remove`, `Remove point ${vertex + 1}`, () => edit(points => points.length > 3 ? points.filter((_, i) => i !== vertex) : points), hole.length <= 3)
      })
      action(`hole-${index}-remove`, 'Remove opening', () => {
        const current = api.read()
        if (current?.type !== 'slab' && current?.type !== 'ceiling') return
        api.update({ holes: current.holes.filter((_, i) => i !== index), holeMetadata: current.holes.map((_, i) => current.holeMetadata[i] ?? { source: 'manual' }).filter((_, i) => i !== index) })
      })
    })
  }

  if (node.type === 'slab' || node.type === 'ceiling') {
    section = 'Openings'
    action('hole-add', 'Add opening', () => {
      const current = api.read()
      if ((current?.type !== 'slab' && current?.type !== 'ceiling') || !current.polygon.length) return
      const x = current.polygon.reduce((sum, point) => sum + point[0], 0) / current.polygon.length
      const z = current.polygon.reduce((sum, point) => sum + point[1], 0) / current.polygon.length
      api.update({ holes: [...current.holes, [[x - 0.5, z - 0.5], [x + 0.5, z - 0.5], [x + 0.5, z + 0.5], [x - 0.5, z + 0.5]]], holeMetadata: [...current.holes.map((_, i) => current.holeMetadata[i] ?? { source: 'manual' }), { source: 'manual' }] })
    })
  }

  if (node.type === 'block') {
    const slots = [...new Set(['body', ...Object.keys(node.slotNames), ...Object.keys(node.slots), ...node.topology.faces.map(face => face.materialSlot)])]
    slots.forEach(slot => {
      section = `Material: ${node.slotNames[slot] ?? slot}`
      rows.push({ id: `nested-slot-${slot}-name`, section, kind: 'text', label: 'Rename', value: node.slotNames[slot] ?? slot, onChange: name => {
        const current = api.read()
        if (current?.type === 'block' && name.trim()) api.update({ slotNames: { ...current.slotNames, [slot]: name.trim() } })
      } })
      const materials = ['Default', ...api.materials.map(material => material.id)]
      const currentMaterial = node.slots[slot]?.replace(/^library:/, '') ?? 'Default'
      choice(`slot-${slot}`, 'Material', currentMaterial, materials, value => {
        const current = api.read()
        if (current?.type !== 'block') return
        const slots = { ...current.slots }
        if (value === 'Default') delete slots[slot]; else slots[slot] = `library:${value}`
        api.update({ slots })
      })
      if (slot !== 'body') action(`slot-${slot}-remove`, 'Remove slot', () => {
        const current = api.read()
        if (current?.type !== 'block') return
        const slots = { ...current.slots }, slotNames = { ...current.slotNames }
        delete slots[slot]; delete slotNames[slot]
        api.update({ slots, slotNames, topology: { ...current.topology, faces: current.topology.faces.map(face => face.materialSlot === slot ? { ...face, materialSlot: 'body' } : face) } })
      })
    })
    section = 'Material slots'
    action('slot-add', 'Add material slot', () => {
      const current = api.read()
      if (current?.type !== 'block') return
      const used = new Set([...Object.keys(current.slotNames), ...Object.keys(current.slots), ...current.topology.faces.map(face => face.materialSlot)])
      let index = 1; while (used.has(`slot-${index}`)) index++
      api.update({ slotNames: { ...current.slotNames, [`slot-${index}`]: `Slot ${index}` } })
    })
    node.topology.faces.forEach(face => choice(`face-${face.id}`, `Face ${face.id}`, face.materialSlot, slots, materialSlot => {
      const current = api.read()
      if (current?.type === 'block') api.update({ topology: { ...current.topology, faces: current.topology.faces.map(entry => entry.id === face.id ? { ...entry, materialSlot } : entry) } })
    }))
  }
  return rows
}
