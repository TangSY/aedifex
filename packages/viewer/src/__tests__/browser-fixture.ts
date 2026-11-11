export function installBrowserFixture() {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const selfDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'self')
  const actDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT')
  const fakeWindow = {
    URL,
    location: new URL('https://app.example/editor'),
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
  }
  Object.defineProperty(globalThis, 'window', {
    value: fakeWindow,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(globalThis, 'self', {
    value: fakeWindow,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    value: true,
    configurable: true,
    writable: true,
  })
  return () => {
    for (const [key, descriptor] of [
      ['window', windowDescriptor],
      ['self', selfDescriptor],
      ['IS_REACT_ACT_ENVIRONMENT', actDescriptor],
    ] as const) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
}
