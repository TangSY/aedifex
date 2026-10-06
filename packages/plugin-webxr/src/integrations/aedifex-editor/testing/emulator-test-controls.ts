import type { XREmulatorTestHarness } from './emulator-test-harness'

/** Opt-in DOM controls let browser QA drive XR events without evaluating page scripts. */
export function mountEmulatorTestControls(harness: XREmulatorTestHarness) {
  if (process.env.NODE_ENV !== 'development' || new URLSearchParams(location.search).get('xrTest') !== '1') {
    return () => undefined
  }
  const form = document.createElement('form')
  form.setAttribute('aria-label', 'XR emulator test controls')
  Object.assign(form.style, {
    position: 'fixed', top: '60px', left: '8px', zIndex: '10000',
    background: '#fff', color: '#111', padding: '8px', maxWidth: '420px',
  })
  const input = document.createElement('textarea')
  input.setAttribute('aria-label', 'XR test command')
  input.value = JSON.stringify({ method: 'snapshot', args: [] })
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = 'Run XR test'
  const output = document.createElement('pre')
  output.setAttribute('aria-label', 'XR test result')
  Object.assign(output.style, { maxHeight: '180px', overflow: 'auto', whiteSpace: 'pre-wrap' })
  form.append(input, button, output)
  const run = async (event: Event) => {
    event.preventDefault()
    button.disabled = true
    output.textContent = 'Running'
    try {
      const { method, args = [] } = JSON.parse(input.value)
      if (!Object.hasOwn(harness, method) || !Array.isArray(args)) throw new Error('Invalid command')
      const action = harness[method as keyof XREmulatorTestHarness]
      if (typeof action !== 'function') throw new Error('Unknown test method')
      const result = await (action as (...args: unknown[]) => unknown)(...args)
      output.textContent = JSON.stringify({ result, snapshot: harness.snapshot() }, null, 2)
    } catch (error) {
      output.textContent = JSON.stringify({ error: String(error) })
    } finally {
      button.disabled = false
    }
  }
  button.onclick = run
  form.onsubmit = run
  document.body.append(form)
  return () => form.remove()
}
