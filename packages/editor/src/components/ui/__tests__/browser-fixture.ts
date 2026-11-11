export function installBrowserFixture() {
  const descriptors = ['window', 'self', 'IS_REACT_ACT_ENVIRONMENT'].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  )
  const fakeWindow = {
    URL,
    location: new URL('https://app.example/editor'),
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
  }
  for (const key of ['window', 'self']) {
    Object.defineProperty(globalThis, key, { value: fakeWindow, configurable: true })
  }
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    value: true,
    configurable: true,
  })
  return () => {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
}
