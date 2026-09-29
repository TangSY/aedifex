export { useWebXRSession, createWebXRViewerSession } from './session'
export { XR_QUALITY_PRESETS, type XRQualityPreset } from './xr/frame-loop'
import type { Plugin } from '@aedifex/core'
import type { ComponentType } from 'react'
import { WEBXR_PLUGIN_ID } from './runtime'

export {
  createWebXRStore,
  getEmulatedXRDevice,
  getImmersiveVRSupport,
  mountEmulatorControls,
  prepareXRPlatform,
  requestWebXRSession,
  resolveRuntimeSource,
  useWebXRFeature,
  useWebXRRuntime,
  VisibleXRController,
  VisibleXRHand,
  WEBXR_ORIGIN_POSITION,
  WEBXR_PLUGIN_ID,
  webXRViewerConfig,
  type WebXRFeature,
  type WebXRRuntimeState,
  type WebXRStore,
  type WebXRStoreFactory,
  type WebXRViewerConfig,
  type XRRuntimeSource,
} from './runtime'
export { WebXRToolbarButton } from './toolbar-button'
export {
  GOD_ORIGIN_POSITION,
  GOD_ORIGIN_ROTATION,
  requestGodScaleReset,
  useGodScaleView,
} from './xr/god-mode'
export {
  type LocomotionSettings,
  useLocomotionSettings,
} from './xr/human-mode'
export {
  PlayerModeScene,
  toggleXRPlayerMode,
  useXRPlayerMode,
  XR_PLAYER_MODES,
  type XRPlayerMode,
} from './xr/mode-switching'
export {
  DEFAULT_WEBXR_SCENE_LAYERS,
  type WebXRSceneLayers,
} from './xr/layers'
export {
  WebXRSessionRoot,
  type WebXRSessionRootProps,
} from './xr/session-root'
export {
  getPage,
  getPageWithPinnedFirst,
  PageArrows,
  PanelFace,
  PanelHeader,
  PanelHint,
  PanelIcon,
  resolveWandPanelFacePose,
  SettingChoice,
  SettingCycle,
  SettingStepper,
  shapeLinePoints,
  SpatialButton,
  SpatialLine,
  SpatialText,
  useXRWandPanelSettings,
  XR_WAND_PANEL_INPUT_NAME,
  XR_WAND_PANEL_LAYOUT,
  XR_WAND_PANEL_SCALE_MAX,
  XR_WAND_PANEL_SCALE_MIN,
  XR_WAND_PANEL_SCALE_STEP,
  XR_WAND_THEME,
  XRFloatingWorkspace,
  XRWandBuildPanel,
  XRWandInputOverlay,
  XRWandPaintPanel,
  XRWandPanel,
  XRWandPanelShell,
  type XRWandAction,
  type XRWandAdapter,
  type XRWandBuildItem,
  type XRWandBuildModel,
  type XRWandBuildSection,
  type XRWandIconModel,
  type XRWandPaintItem,
  type XRWandPaintModel,
  type XRWandSettingRow,
  type XRWandSettingsModel,
} from './xr/wand'

export const webXRPlugin: Plugin = {
  id: WEBXR_PLUGIN_ID,
  apiVersion: 2,
  nodes: [],
}

export const webXRHostPanel: WebXRHostPanel = {
  id: 'webxr:panel',
  pluginId: webXRPlugin.id,
  label: 'WebXR',
  description: 'Enter an immersive WebXR session from the editor.',
  creator: { name: 'WebXR', url: 'https://www.w3.org/TR/webxr/' },
  pluginUrl: 'https://www.w3.org/TR/webxr/',
  icon: { kind: 'iconify', name: 'fa6-solid:vr-cardboard' },
  component: () => import('./panel'),
  defaultInstalled: true,
}

type WebXRHostPanel = {
  id: string
  pluginId: string
  label: string
  description: string
  creator: { name: string; url: string }
  pluginUrl: string
  icon: { kind: 'iconify'; name: string }
  component: () => Promise<{ default: ComponentType }>
  defaultInstalled: boolean
}
