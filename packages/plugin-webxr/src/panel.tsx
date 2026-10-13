'use client'

import { BookOpen, Orbit, PersonStanding, RectangleGoggles } from 'lucide-react'
import { useWebXRSessionControls } from './session-controls'

const guide = [
  ['Select and place', 'Point at an item or control, then press the trigger. With hand tracking, pinch to select.'],
  ['Move the panel', 'Grab the panel’s drag handle with the trigger or a pinch, then move it.'],
  ['Scroll settings', 'Hold the trigger or pinch over a list and drag. Tap a section heading to collapse it.'],
  ['God mode', 'Hold one controller grip to move the model. Hold both grips and move your hands to scale and rotate it.'],
  ['Human mode', 'Use the left thumbstick to move and the right thumbstick to turn.'],
  ['Switch modes', 'Use the XR scale control in VR Settings, or press X on a supported left controller. To enter Human mode, place a target on a clear floor, then confirm Enter.'],
] as const

export default function WebXRPanel() {
  const controls = useWebXRSessionControls(state => state.controls)
  const startingMode = useWebXRSessionControls(state => state.startingMode)
  const setStartingMode = useWebXRSessionControls(state => state.setStartingMode)
  const active = controls?.active ?? false
  const entering = controls?.entering ?? false
  const unavailable = controls?.unavailable ?? false
  const disabled = !controls || entering || (!active && (unavailable || !controls.ready))
  const status = active ? 'VR session active' : entering ? 'Starting VR…' : unavailable ? 'Immersive VR is not supported on this device' : controls?.error ? 'Could not start VR' : controls?.ready ? 'Ready to enter VR' : 'Preparing VR…'

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-y-auto p-4 text-sidebar-foreground">
      <div className="space-y-3">
        <h2 className="font-semibold text-base">WebXR</h2>
        <p aria-live="polite" className="text-sidebar-foreground/60 text-xs">{status}</p>
        <button
          type="button"
          disabled={disabled}
          aria-pressed={active}
          title={unavailable && !active ? 'Connect a compatible headset and use a WebXR-enabled browser over HTTPS.' : undefined}
          onClick={() => { if (controls && !disabled) void (active ? controls.exit() : controls.enter()) }}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RectangleGoggles aria-hidden="true" className="h-4 w-4" />
          {active ? 'Exit VR' : entering ? 'Entering VR…' : unavailable ? 'VR unavailable' : 'Enter VR'}
        </button>
        {controls?.error && <p role="alert" className="text-xs text-destructive">{controls.error}</p>}
      </div>

      <fieldset className="space-y-3" disabled={active || entering}>
        <legend className="mb-3 text-sm font-medium">Starting view</legend>
        <div className="grid grid-cols-2 gap-2">
          {([
            { mode: 'god', label: 'God', Icon: Orbit },
            { mode: 'human', label: 'Human', Icon: PersonStanding },
          ] as const).map(({ mode, label, Icon }) => (
            <button
              key={mode}
              type="button"
              aria-pressed={startingMode === mode}
              onClick={() => setStartingMode(mode)}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-3 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${startingMode === mode ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted/30 text-sidebar-foreground/60 hover:bg-muted'}`}
            >
              <Icon aria-hidden="true" className="h-4 w-4" />{label}
            </button>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-sidebar-foreground/60">
          {startingMode === 'god'
            ? 'Start above the model. Move, rotate, and scale it with your controllers.'
            : 'Choose a clear floor in VR, then confirm your target to explore at full scale.'}
          {active && ' Change the current mode from VR Settings.'}
        </p>
      </fieldset>

      <section aria-labelledby="webxr-controls-heading" className="space-y-4 border-t border-border pt-4">
        <h3 id="webxr-controls-heading" className="flex items-center gap-2 text-sm font-medium">
          <BookOpen aria-hidden="true" className="h-4 w-4" />Controls guide
        </h3>
        <dl className="space-y-4">
          {guide.map(([title, description]) => (
            <div key={title}>
              <dt className="text-xs font-medium">{title}</dt>
              <dd className="mt-1 text-xs leading-relaxed text-sidebar-foreground/60">{description}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}
