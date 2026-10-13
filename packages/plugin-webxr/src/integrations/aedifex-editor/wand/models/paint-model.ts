'use client'

import { toLibraryMaterialRef, toSceneMaterialRef } from '@aedifex/core'
import {
  cyclePaintScope, getActivePaintMaterialLabel, hasActivePaintMaterial, type PaintHoverInfo, paintScopeLabel,
  useEditor, useMaterialCatalogModel, useMaterialPaintPanelModel,
} from '@aedifex/editor'
import type { XRWandPaintModel } from '../../../../xr/wand'
import { useRef, useState } from 'react'
import type { AedifexXRWandBindings } from '../bindings'

export function useAedifexXRWandPaintModel(bindings: AedifexXRWandBindings): XRWandPaintModel {
  const mode = useEditor((state) => state.mode)
  const paint = useMaterialPaintPanelModel(mode === 'material-paint')
  const selectMaterial = (ref: string) => { bindings.activatePaintMode(); paint.selectMaterial(ref) }
  const catalog = useMaterialCatalogModel(paint.activePaintMaterial?.materialPreset, selectMaterial)
  const [showScene, setShowScene] = useState(false)
  const paintHover = useEditor((state) => state.paintHover)
  const paintScope = useEditor((state) => state.paintScope)
  const setPaintScope = useEditor((state) => state.setPaintScope)
  const lastHover = useRef<PaintHoverInfo | null>(null)
  if (mode !== 'material-paint') lastHover.current = null
  else if (paintHover) lastHover.current = paintHover
  const context = paintHover ?? lastHover.current
  const enabled = mode === 'material-paint' && (paint.paintEraser || hasActivePaintMaterial(paint.activePaintMaterial))
  const scopes = context?.scopes ?? ['single']
  const effectiveScope = scopes.includes(paintScope) ? paintScope : 'single'
  const label = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)
  const changeCategory = (direction: number) => {
    const index = catalog.availableCategories.indexOf(catalog.selectedCategory)
    const next = catalog.availableCategories[(index + direction + catalog.availableCategories.length) % catalog.availableCategories.length]
    if (next) { setShowScene(false); catalog.setSelectedCategory(next) }
  }
  return {
    activeMaterialLabel: getActivePaintMaterialLabel(paint.activePaintMaterial),
    canPaint: hasActivePaintMaterial(paint.activePaintMaterial),
    stopPainting: bindings.activateSelectMode,
    categories: [
      ...catalog.availableCategories.map((category) => ({
        id: category, label: label(category), selected: !showScene && catalog.selectedCategory === category,
        onSelect: () => { setShowScene(false); catalog.setSelectedCategory(category) },
      })),
      { id: 'scene', label: 'Scene materials', selected: showScene, onSelect: () => setShowScene(true) },
      ...catalog.visibleSourceFilters.map((source) => ({
        id: `source-${source.id}`, label: `Source: ${source.label}`, selected: catalog.sourceFilter === source.id,
        onSelect: () => { setShowScene(false); catalog.setSourceFilter(source.id) },
      })),
    ],
    brushActive: mode === 'material-paint' && !paint.paintEraser,
    eraserActive: mode === 'material-paint' && paint.paintEraser,
    category: {
      canChange: catalog.availableCategories.length > 1,
      label: showScene ? 'Scene materials' : label(catalog.selectedCategory),
      next: () => changeCategory(1), previous: () => changeCategory(-1),
      position: catalog.availableCategories.indexOf(catalog.selectedCategory), total: catalog.availableCategories.length,
    },
    items: showScene ? Object.values(paint.materials).map((item) => ({
      id: item.id, label: item.name, icon: { color: item.material.properties?.color ?? '#ffffff' },
      onSelect: () => selectMaterial(toSceneMaterialRef(item.id)),
      selected: !paint.paintEraser && paint.activePaintMaterial?.materialPreset === toSceneMaterialRef(item.id),
    })) : catalog.catalogItems.map((item) => ({
      id: item.id, label: item.label, icon: { color: item.previewColor ?? item.preset.mapProperties.color, src: item.previewThumbnailUrl },
      onSelect: () => catalog.select(item.id),
      selected: !paint.paintEraser && paint.activePaintMaterial?.materialPreset === toLibraryMaterialRef(item.id),
    })),
    mark: mode === 'material-paint' ? (paint.paintEraser ? 'Erasing' : 'Painting') : 'Browse materials',
    page: 0, pageCount: 1,
    scope: {
      disabled: !enabled || !context || scopes.length <= 1,
      label: !enabled ? 'Choose a material or activate Paint / Erase' : context ? `${paint.paintEraser ? 'Erase' : 'Paint'}: ${paintScopeLabel(effectiveScope, context)}` : 'Aim at a surface',
      onSelect: () => setPaintScope(cyclePaintScope(effectiveScope, scopes)),
      selected: scopes.length > 1 && effectiveScope !== 'single',
    },
    actions: [
      { id: 'reset-selection', label: 'Reset all', disabled: !paint.canResetSelection, onSelect: paint.resetSelection },
      { id: 'create-material', label: 'Add material', onSelect: () => { bindings.activatePaintMode(); paint.createCustomMaterial(); setShowScene(true) } },
    ],
    startPainting: () => { bindings.activatePaintMode(); paint.setPaintEraser(false) },
    toggleEraser: () => { bindings.activatePaintMode(); paint.setPaintEraser(mode !== 'material-paint' || !paint.paintEraser) },
  }
}
