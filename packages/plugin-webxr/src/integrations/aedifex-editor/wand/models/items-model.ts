'use client'

import { activateCatalogItem, filterCatalogItems, furnishTools, isCatalogItemSelected, useEditor } from '@aedifex/editor'
import type { XRWandBuildItem, XRWandItemsModel } from '../../../../xr/wand'
import type { AedifexXRWandBindings } from '../bindings'

export function useAedifexXRWandItemsModel(_bindings: AedifexXRWandBindings, category?: (typeof furnishTools)[number]['catalogCategory']): XRWandBuildItem[] {
  const selectedItem = useEditor((state) => state.selectedItem)
  return filterCatalogItems({ category }).map((item) => ({
    active: isCatalogItemSelected(item, selectedItem),
    icon: { src: item.thumbnail },
    id: `item-${item.id}`,
    label: item.name,
    onSelect: () => activateCatalogItem(item),
  }))
}

export function useAedifexXRWandItemsPanelModel(bindings: AedifexXRWandBindings): XRWandItemsModel {
  const catalogCategory = useEditor((state) => state.catalogCategory)
  const categoryId = furnishTools.find((category) => category.catalogCategory === catalogCategory)?.catalogCategory ?? furnishTools[0]!.catalogCategory
  const items = useAedifexXRWandItemsModel(bindings, categoryId)
  return {
    categoryId,
    items,
    categories: furnishTools.map((category) => ({
      id: category.catalogCategory, label: category.label, icon: { src: category.iconSrc },
      active: category.catalogCategory === categoryId,
      onSelect: () => useEditor.getState().setCatalogCategory(category.catalogCategory),
    })),
  }
}
