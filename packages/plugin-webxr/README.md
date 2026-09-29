# Aedifex WebXR integration

Adapted from https://github.com/sudhir9297/webxr-pascal-plugin at commit `31063230d0cd5b244b04eca12c6e31b5b757cb5e` (MIT; see LICENSE). Preserves the original VR runtime, controller/hand interaction, locomotion, and spatial editing panels. Host imports and Plugin API manifest are adapted to Aedifex v2; all runtime stores share the host packages.

# WebXR plugin

WebXR session support for the Aedifex editor.

The VR button enters the current editor scene in place. It uses a native
headset when available and an emulated Meta Quest 3 during local development.
No route change, popup, scene snapshot, or second scene store is needed.

The plugin owns the XR runtime:

- native and IWER platform setup
- immersive session creation and frame rendering
- default WebXR controller and hand models
- God and Human modes, locomotion, collision, and comfort controls
- tracked pointer rays and stereo-eye layer handling
- a floating Build, Paint, and Settings workspace, including its spatial controls and session state
- the Aedifex editor input bridge, inline session integration and development emulator harness
- Aedifex-specific Build, Paint, Terrain, selection, and parametric-settings models

The Aedifex viewer remains the host for the scene renderer, lights, materials,
and camera theme. The editor supplies a small `AedifexXRWandBindings` object for
private desktop commands that are not part of the public editor package API.
The plugin turns those bindings into its `XRWandAdapter`; the editor does not
implement the XR session, player modes, controller/hand attachment, input
bridge, emulator harness, or wand models and rendering.

Aedifex-specific host integration is isolated from the generic WebXR runtime:

```text
src/integrations/aedifex-editor/
├── input/    # editor event routing and reference-space ray conversion
├── inline-session.tsx # live editor session and toolbar controls
├── testing/  # development emulator harness
└── wand/     # host bindings plus Build/Paint/Settings/Terrain models
```

## Development

### Floating XR workspace

The Aedifex integration opens a stationary workspace 1.05 m ahead of the user. Paint,
Build, and Settings share one tall panel with a compact vertical tool rail on its
left. Drag the bar below the panel to move it. Panel size remains available in
Settings, and tab navigation and tool selections are preserved.

Press left-controller **Y** to bring the workspace back in front of you.
The tool rail also has a Center button. **X** switches between God and Human
mode. The workspace stays independent of God-mode model scaling and does not
follow the user. Direct touch/poke interaction is not enabled; use rays and
trigger/pinch selection.

With hand tracking or controllers, turn the **inside of your left wrist toward yourself** to
reveal the watch. Aim the right-hand ray and pinch (or use the right controller's
ray and trigger) to switch between Walkthrough and God Mode. Controller placement
approximates the wrist with a grip-local offset; hand tracking uses wrist joints.
The band follows the wrist; the controls hide when
turned away or tracking is lost. The watch remains available with the workspace
hidden, and also provides **Show/Hide panel** and **Bring here**. It uses the
shared mode-entry flow described below. Transition fades remain separate work.

### Safe Walkthrough entry

Choose Walkthrough from the wrist, controller X button, or panel to open an entry preview.
Point the right-hand/controller ray at clear ground or a floor, then click the trigger or
pinch to **place** the target. The blue preview becomes a fixed green marker and the popup
offers **Enter**, **Replace**, and **Cancel**. Enter (or repeating the mode action) is gated
until placement. Moving your ray does not move a placed target. **Replace** clears it and
resumes aiming. UI presses cannot place targets, and entry targeting suspends scene-editing
pointer input. Placement queries the actual click ray; it never silently substitutes a spawn.
Without a safe destination you remain in God mode; confirmation checks current geometry again.

Switching in either direction fades out for approximately 180 ms, holds a full black frame,
applies the validated pose/scale change, and fades in for approximately 180 ms. Navigation,
scene editing and spatial UI input are locked throughout. Active editor operations use the
editor's cancellation path; pointer captures and panel drags are released without committing
an editor drag. Repeated mode requests are ignored during the transition.

After fading in, release buttons, grips and pinches and center the sticks. Controls rearm
after 150 ms of tracked neutral input; a headset prompt explains when release is needed.
Loss of headset tracking/focus pauses the transition, and session teardown resets it.

The Aedifex adapter classifies the site's ground/terrain, slabs and roads as candidate surfaces and checks
body/head clearance, support near edges, and slope. Upper-level and basement elevations
are retained. This validates arrival only; full stairs/gravity/ledge traversal is separate work.
Generic `createWebXRViewerSession` consumers must provide the optional final `standingScene`
provider (or `PlayerModeScene.standingScene`) with detached, life-size query meshes and
spawn positions. Without a provider, entry fails closed rather than inventing a Y=0 floor.

### Local checks

For browser-driven emulator checks, open the local editor with `?xrTest=1`
and enter VR. The development-only **XR emulator tests** panel lists commands
and accepts their arguments as a JSON array. It drives the emulated controller
or hand through the XR input pipeline. `listSpatialTargets`, `listHandles`,
and `readNode` help inspect targets and verify committed changes.

See [browser QA results](docs/webxr-browser-qa.md) for the tested host setup,
fixes, coverage, and remaining hardware checks.

```bash
cd ../editor
bun install
cd ../webxr-pascal-plugin
bun run check-types
bun test
```

The sibling `../editor` checkout is used for local Aedifex package development.
The editor workspace includes `../webxr-pascal-plugin` and the app depends on
`@webxr/plugin` through `workspace:*`. Run `bun install` in `../editor` after
cloning both sibling repositories.
Its Turbopack aliases resolve both projects to the host's React, Three, Fiber,
XR, and Aedifex packages so the scene and controller stores stay shared.

The host calls `useAedifexWebXR(webXRWandBindings)`, passes `feature.immersive`
to `<Editor immersive={...}>`, and mounts `<AedifexWebXRButton feature={feature} />`
beside Walkthrough. The plugin prepares XR before the click, requests the
session during the click, and ends it on unmount. Exit restores the desktop
view, camera, wall and level modes. Build/Paint changes remain in the live scene.

The root package exposes its manifest, toolbar button, session wrappers, runtime
hooks, viewer configuration, player modes, and generic wand API. Aedifex editor
integration is exposed separately from `@webxr/plugin/aedifex-editor` so generic
consumers do not eagerly load editor-only modules.

## pmndrs documentation

The project configures the pmndrs documentation MCP server in
`.codex/config.toml`. Codex can use it to read the current React Three Fiber,
Drei, Zustand, and React XR documentation while working in this repository.

Restart the Codex client after cloning the repository so it loads the
project-scoped MCP configuration.

## License

MIT
