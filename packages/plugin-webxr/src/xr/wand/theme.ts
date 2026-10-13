export const XR_WAND_THEME = {
  // Matches the editor's neutral .dark palette; borders are composited on charcoal.
  accent: '#353535',
  accentLine: '#e5e5e5',
  border: '#404040',
  disabled: '#737373',
  muted: '#a3a3a3',
  panel: '#171717',
  surface: '#262626',
  hover: '#303030',
  destructive: '#482525',
  destructiveText: '#f87171',
  text: '#fafafa',
} as const

// Editor selection overlays occupy orders 1000–1009 and may disable depth testing.
// Panel surfaces and their contents share the transparent pass so this order wins.
export const XR_PANEL_RENDER_ORDER = 2000
