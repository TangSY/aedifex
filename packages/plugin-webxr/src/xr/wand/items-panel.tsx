'use client'

import type { XRWandItemsModel } from './adapter'
import { PaletteTile } from './build-panel'
import { PanelIcon } from './panel-icon'
import { PanelHeader, PanelHint, SpatialButton } from './spatial-controls'
import { SpatialScroll } from './spatial-scroll'
import { SpatialText } from './spatial-text'
import { XR_WAND_THEME } from './theme'

export function XRWandItemsPanel({ useItemsModel }: { useItemsModel: () => XRWandItemsModel }) {
  const { categories, categoryId, items } = useItemsModel()
  return (
    <group name="xr-wand-items-panel">
      <PanelHeader title="Items" mark={`${items.length} items`} width={1.4} />
      <group name="xr-items-categories">
        {categories.map((category, index) => (
          <SpatialButton
            key={category.id}
            name={`xr-items-category-${category.id}`}
            position={[(index - (categories.length - 1) / 2) * 0.25, 0.3, 0]}
            size={[0.23, 0.14]}
            selected={category.active}
            onClick={category.onSelect}
          >
            <PanelIcon muted={!category.active} src={category.icon?.src} size={0.067} positionY={0.018} />
            <SpatialText color={category.active ? XR_WAND_THEME.text : XR_WAND_THEME.muted}
              fontSize={0.022} maxWidth={0.21} position={[0, -0.042, 0.012]}>
              {category.label}
            </SpatialText>
          </SpatialButton>
        ))}
      </group>
      <SpatialScroll key={categoryId} name="xr-items-scroll" width={1.3} height={0.54}
        virtualRows={{ count: Math.ceil(items.length / 4), height: 0.235 }}
        contentHeight={Math.ceil(items.length / 4) * 0.235} position={[0, -0.09, 0]}>
        {({ start, end }) => (
          <group position={[0, -0.095, 0]}>
            {items.slice(start * 4, end * 4).map((item, index) => (
              <PaletteTile item={item} index={start * 4 + index} key={item.id} />
            ))}
          </group>
        )}
      </SpatialScroll>
      <PanelHint position={[0, -0.44, 0.012]}>
        {items.length ? 'Drag to browse · Choose an item, then point at the scene to place it' : 'No items in this category'}
      </PanelHint>
    </group>
  )
}
