'use client'

import { useState } from 'react'
import type { XRWandAdapter, XRWandPaintItem } from './adapter'
import { PanelIcon } from './panel-icon'
import { PanelHeader, SpatialButton } from './spatial-controls'
import { SpatialLine } from './spatial-line'
import { SpatialScroll } from './spatial-scroll'
import { SpatialText } from './spatial-text'
import { XR_WAND_THEME as theme } from './theme'

function MaterialTile({ item, index }: { item: XRWandPaintItem; index: number }) {
  return (
    <SpatialButton
      name={`xr-paint-material-${item.id}`}
      onClick={item.onSelect}
      position={[((index % 4) - 1.5) * 0.3, 0.12 - Math.floor(index / 4) * 0.24, 0]}
      selected={item.selected}
      size={[0.275, 0.22]}
    >
      <PanelIcon color={item.icon.color} size={0.14} positionY={0.026} src={item.icon.src} />
      <SpatialText
        color={theme.text}
        fontSize={0.021}
        maxWidth={0.25}
        position={[0, -0.078, 0.014]}
        textAlign="center"
      >
        {item.label}
      </SpatialText>
    </SpatialButton>
  )
}

export function XRWandPaintPanel({ adapter }: { adapter: XRWandAdapter }) {
  const model = adapter.usePaintModel()
  const [choosingCategory, setChoosingCategory] = useState(false)
  const active = model.brushActive || model.eraserActive
  return (
    <group name="xr-wand-paint-panel">
      <PanelHeader mark={model.mark} title="Paint" width={1.4} />
      <group position={[0, 0.34, 0]}>
        <SpatialButton
          name="xr-paint-start"
          onClick={model.startPainting}
          disabled={!model.canPaint}
          selected={model.brushActive && model.canPaint}
          position={[-0.43, 0, 0]}
          size={[0.39, 0.08]}
        >
          <SpatialText color={theme.text} fontSize={0.026} position={[0, 0, 0.014]}>
            Paint
          </SpatialText>
        </SpatialButton>
        <SpatialButton
          name="xr-paint-eraser"
          onClick={model.toggleEraser}
          selected={model.eraserActive}
          position={[0, 0, 0]}
          size={[0.39, 0.08]}
        >
          <SpatialText color={theme.text} fontSize={0.026} position={[0, 0, 0.014]}>
            Erase
          </SpatialText>
        </SpatialButton>
        <SpatialButton
          name="xr-paint-done"
          onClick={model.stopPainting}
          disabled={!active}
          position={[0.43, 0, 0]}
          size={[0.39, 0.08]}
        >
          <SpatialText color={theme.text} fontSize={0.026} position={[0, 0, 0.014]}>
            Done
          </SpatialText>
        </SpatialButton>
      </group>
      <group position={[0, 0.235, 0]}>
        <SpatialButton
          name="xr-paint-previous-category"
          disabled={!model.category.canChange}
          onClick={model.category.previous}
          position={[-0.58, 0, 0]}
          size={[0.085, 0.07]}
        >
          <SpatialText color={theme.text} fontSize={0.035} position={[0, 0, 0.014]}>
            ‹
          </SpatialText>
        </SpatialButton>
        <SpatialButton
          name="xr-paint-categories"
          onClick={() => setChoosingCategory(!choosingCategory)}
          selected={choosingCategory}
          position={[0, 0, 0]}
          size={[0.99, 0.07]}
        >
          <SpatialText color={theme.text} fontSize={0.025} maxWidth={0.9} position={[0, 0, 0.014]}>
            {choosingCategory
              ? 'Choose category · Close ×'
              : `${model.category.label} · ${model.items.length} materials ▾`}
          </SpatialText>
        </SpatialButton>
        <SpatialButton
          name="xr-paint-next-category"
          disabled={!model.category.canChange}
          onClick={model.category.next}
          position={[0.58, 0, 0]}
          size={[0.085, 0.07]}
        >
          <SpatialText color={theme.text} fontSize={0.035} position={[0, 0, 0.014]}>
            ›
          </SpatialText>
        </SpatialButton>
      </group>
      {choosingCategory ? (
        <SpatialScroll
          name="xr-paint-categories-scroll"
          width={1.22}
          height={0.48}
          contentHeight={Math.ceil(model.categories.length / 3) * 0.1}
          position={[-0.012, -0.055, 0]}
        >
          {model.categories.map((category, index) => (
            <SpatialButton
              key={category.id}
              name={`xr-paint-category-${category.id}`}
              selected={category.selected}
              size={[0.38, 0.085]}
              position={[((index % 3) - 1) * 0.405, 0.19 - Math.floor(index / 3) * 0.1, 0]}
              onClick={() => {
                category.onSelect()
                setChoosingCategory(false)
              }}
            >
              <SpatialText
                color={theme.text}
                fontSize={0.023}
                maxWidth={0.35}
                position={[0, 0, 0.014]}
              >
                {category.label}
              </SpatialText>
            </SpatialButton>
          ))}
        </SpatialScroll>
      ) : model.items.length ? (
        <SpatialScroll
          key={model.category.label}
          name="xr-paint-materials-scroll"
          width={1.22}
          height={0.48}
          contentHeight={Math.ceil(model.items.length / 4) * 0.24}
          position={[-0.012, -0.055, 0]}
        >
          {model.items.map((item, index) => (
            <MaterialTile key={item.id} item={item} index={index} />
          ))}
        </SpatialScroll>
      ) : (
        <SpatialText color={theme.muted} fontSize={0.026} position={[0, -0.04, 0.014]}>
          No materials available
        </SpatialText>
      )}
      <SpatialLine
        color={theme.border}
        opacity={0.6}
        points={[
          [-0.63, -0.32, 0.012],
          [0.63, -0.32, 0.012],
        ]}
      />
      <SpatialText
        anchorX="left"
        color={theme.text}
        fontSize={0.023}
        maxWidth={1.22}
        position={[-0.61, -0.35, 0.014]}
      >
        {model.eraserActive
          ? 'Erase · Restore original surface'
          : model.canPaint
            ? model.activeMaterialLabel
            : 'Choose a material to start painting'}
      </SpatialText>
      <SpatialButton
        name="xr-paint-scope"
        disabled={model.scope.disabled}
        onClick={model.scope.onSelect}
        selected={model.scope.selected}
        position={[0, -0.411, 0]}
        size={[1.24, 0.067]}
      >
        <SpatialText
          color={model.scope.disabled ? theme.muted : theme.text}
          fontSize={0.023}
          maxWidth={1.16}
          position={[0, 0, 0.014]}
        >
          {model.scope.label}
          {model.scope.disabled ? '' : '  ›'}
        </SpatialText>
      </SpatialButton>
      {model.actions?.map((action, index) => (
        <SpatialButton key={action.id} name={`xr-paint-${action.id}`} onClick={action.onSelect}
          disabled={action.disabled} position={[(index - ((model.actions?.length ?? 1) - 1) / 2) * 0.63, -0.479, 0]}
          size={[0.59, 0.05]}>
          <SpatialText color={theme.text} fontSize={0.021} position={[0, 0, 0.014]}>{action.label}</SpatialText>
        </SpatialButton>
      ))}
    </group>
  )
}
