import { beforeEach, describe, expect, test } from 'bun:test'
import {
  useXRWandPanelSettings,
  XR_WAND_PANEL_SCALE_MAX,
  XR_WAND_PANEL_SCALE_MIN,
} from './panel-settings'

describe('XR wand panel settings', () => {
  beforeEach(() =>
    useXRWandPanelSettings.setState({
      buildMainPage: 0,
      buildPage: 0,
      buildSection: 'main',
      paintCategoryIndex: 0,
      paintPage: 0,
      panelScale: 1,
      settingsContextKey: '',
      settingsPage: 0,
      terrainPage: 0,
    }),
  )

  test('preserves build navigation outside the remounting input subtree', () => {
    const { setBuildNavigation } = useXRWandPanelSettings.getState()

    setBuildNavigation('roof', 2)
    expect(useXRWandPanelSettings.getState()).toMatchObject({
      buildPage: 2,
      buildSection: 'roof',
    })

    setBuildNavigation('main', -1)
    expect(useXRWandPanelSettings.getState()).toMatchObject({
      buildPage: 0,
      buildSection: 'main',
    })
  })

  test('keeps the main palette page while browsing sub-items', () => {
    const { setBuildNavigation } = useXRWandPanelSettings.getState()
    setBuildNavigation('main', 1)
    setBuildNavigation('roof', 0)
    setBuildNavigation('roof', 2)
    expect(useXRWandPanelSettings.getState()).toMatchObject({
      buildMainPage: 1,
      buildPage: 2,
      buildSection: 'roof',
    })
    setBuildNavigation('items', 3)
    expect(useXRWandPanelSettings.getState().buildMainPage).toBe(1)
    setBuildNavigation('main', useXRWandPanelSettings.getState().buildMainPage)
    expect(useXRWandPanelSettings.getState()).toMatchObject({
      buildMainPage: 1,
      buildPage: 1,
      buildSection: 'main',
    })
  })

  test('preserves every paginated panel across input remounts', () => {
    const { setPaintNavigation, setSettingsNavigation, setTerrainPage } =
      useXRWandPanelSettings.getState()

    setPaintNavigation(2, 3)
    setSettingsNavigation('wall:wall-1', 4)
    setTerrainPage(1)

    expect(useXRWandPanelSettings.getState()).toMatchObject({
      paintCategoryIndex: 2,
      paintPage: 3,
      settingsContextKey: 'wall:wall-1',
      settingsPage: 4,
      terrainPage: 1,
    })
  })

  test('updates panel size in stable decimal steps', () => {
    const { setPanelScale } = useXRWandPanelSettings.getState()

    setPanelScale(1.1)
    expect(useXRWandPanelSettings.getState().panelScale).toBe(1.1)
    setPanelScale(1.200_000_000_000_000_2)
    expect(useXRWandPanelSettings.getState().panelScale).toBe(1.2)
  })

  test('clamps the reference project scale range and rejects non-finite input', () => {
    const { setPanelScale } = useXRWandPanelSettings.getState()

    setPanelScale(99)
    expect(useXRWandPanelSettings.getState().panelScale).toBe(XR_WAND_PANEL_SCALE_MAX)
    setPanelScale(0)
    expect(useXRWandPanelSettings.getState().panelScale).toBe(XR_WAND_PANEL_SCALE_MIN)
    setPanelScale(Number.NaN)
    expect(useXRWandPanelSettings.getState().panelScale).toBe(XR_WAND_PANEL_SCALE_MIN)
  })
})
