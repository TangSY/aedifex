export type XRWandIconModel = {
  color?: string
  src?: string
}

export type XRWandBuildItem = {
  section?: string
  active?: boolean
  icon?: XRWandIconModel
  id: string
  label: string
  onSelect: () => void
}

export type XRWandBuildModel = {
  detailMode?: 'paint'
  back?: { label: string; onSelect: () => void }
  items: XRWandBuildItem[]
  secondaryItems?: XRWandBuildItem[]
  secondaryTitle?: string
  mark: string
  onPageChange?: (page: number) => void
  page: number
  pageCount: number
  section: string
  title: string
}

export type XRWandItemsModel = {
  categories: XRWandBuildItem[]
  categoryId: string
  items: XRWandBuildItem[]
}

export type XRWandPaintItem = {
  icon: XRWandIconModel
  id: string
  label: string
  onSelect: () => void
  selected?: boolean
}

export type XRWandPaintModel = {
  actions?: XRWandAction[]
  activeMaterialLabel: string
  canPaint: boolean
  stopPainting: () => void
  categories: { id: string; label: string; selected: boolean; onSelect: () => void }[]
  brushActive: boolean
  category: {
    canChange: boolean
    label: string
    next: () => void
    position: number
    previous: () => void
    total: number
  }
  eraserActive: boolean
  items: XRWandPaintItem[]
  mark: string
  onPageChange?: (page: number) => void
  page: number
  pageCount: number
  scope: {
    disabled: boolean
    label: string
    onSelect: () => void
    selected: boolean
  }
  startPainting: () => void
  toggleEraser: () => void
}

export type XRWandAction = {
  icon?: XRWandIconModel
  disabled?: boolean
  id: string
  label: string
  onSelect?: () => void
}

export type XRWandSettingRow = { section?: string; mixed?: boolean } & (
  | {
      id: string
      kind: 'action'
      icon?: XRWandIconModel
      label: string
      onSelect?: () => void
      disabled?: boolean
    }
  | {
      actions: XRWandAction[]
      id: string
      kind: 'actions'
    }
  | {
      id: string
      kind: 'choice'
      label: string
      onSelect?: () => void
      value: string
    }
  | {
      getValue: () => string
      id: string
      kind: 'subscribed-choice'
      label: string
      onSelect?: () => void
      subscribe: (listener: () => void) => () => void
    }
  | {
      id: string
      kind: 'cycle'
      label: string
      next: () => void
      previous: () => void
      value: string
    }
  | {
      id: string
      kind: 'text'
      label: string
      value: string
      onChange: (value: string) => void
    }
  | {
      id: string
      kind: 'stepper'
      label: string
      max: number
      min: number
      onChange: (value: number) => void
      step: number
      unit?: string
      value: number
    }
)

export type XRWandSettingsOptions = {
  unpaged?: boolean
  scope?: 'context' | 'workspace' | 'selection'
  pageSize?: number
}

export type XRWandSettingsModel = {
  contextKey?: string
  onClearSelection?: () => void
  contextual?: boolean
  emptyMessage?: string
  headerActions?: XRWandAction[]
  mark: string
  onDelete?: () => void
  onPageChange?: (page: number) => void
  page: number
  pageCount: number
  rows: XRWandSettingRow[]
  title: string
}

export type XRWandAdapter = {
  useBuildModel: (options?: { separateItems?: boolean }) => XRWandBuildModel
  useItemsModel?: () => XRWandItemsModel
  usePaintModel: () => XRWandPaintModel
  useSettingsModel: (options?: XRWandSettingsOptions) => XRWandSettingsModel
}
