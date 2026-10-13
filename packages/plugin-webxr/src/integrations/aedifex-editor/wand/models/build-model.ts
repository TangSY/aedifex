'use client'

import { getPageWithPinnedFirst, useXRWandPanelSettings, type XRWandBuildItem, type XRWandBuildModel } from '../../../../xr/wand'
import type { AedifexXRWandBindings } from '../bindings'
import { useAedifexXRWandItemsModel } from './items-model'

const ITEMS_PER_PAGE = 12

export function useAedifexXRWandBuildModel(bindings: AedifexXRWandBindings, options?: { separateItems?: boolean }): XRWandBuildModel {
  const model = bindings.useBuildPalette()
  const mainPage = useXRWandPanelSettings((state) => state.buildMainPage)
  const section = useXRWandPanelSettings((state) => state.buildSection)
  const setNavigation = useXRWandPanelSettings((state) => state.setBuildNavigation)
  const catalog = useAedifexXRWandItemsModel(bindings)
  const select: XRWandBuildItem = {
    id: 'select', label: 'Select', icon: { src: '/icons/select.webp' },
    onSelect: () => { bindings.activateSelectMode(); setNavigation('main', mainPage) },
  }
  const entries = [select, ...(!options?.separateItems ? [{
    id: 'items', label: 'Items', icon: { src: '/icons/couch.webp' },
    active: section === 'items',
    onSelect: () => { bindings.activateSelectMode(); setNavigation('items', 0) },
  }] : []), ...model.items.map((item) => ({
    ...item, onSelect: () => { setNavigation('main', mainPage); item.onSelect() },
  }))]
  const page = getPageWithPinnedFirst(entries, mainPage, ITEMS_PER_PAGE)
  const showItems = !options?.separateItems && section === 'items'
  return {
    ...model, items: page.items, page: page.currentPage, pageCount: page.pageCount,
    onPageChange: (next) => setNavigation(showItems ? 'items' : 'main', next),
    secondaryItems: showItems ? catalog : model.secondaryItems,
    secondaryTitle: showItems ? 'Items' : model.secondaryTitle,
    section: showItems ? 'items' : model.section,
    back: model.secondaryItems?.length || showItems ? {
      label: 'Close', onSelect: () => { bindings.activateSelectMode(); setNavigation('main', mainPage) },
    } : undefined,
  }
}
