import { expect, spyOn, test } from 'bun:test'
import { configureClientAssetPolicy, getClientAssetPolicy } from '@aedifex/core'
import { create } from '@react-three/test-renderer'
import { act } from 'react'
import { installBrowserFixture } from '../__tests__/browser-fixture'
import { AssetPolicyGate } from './asset-policy-gate'

const view = (
  <AssetPolicyGate
    policyUrl="/api/asset-policy"
    loading={<group name="loading" />}
    unavailable={<group name="unavailable" />}
  >
    <group name="scene" />
  </AssetPolicyGate>
)

test('holds the scene until a valid policy is installed', async () => {
  const restoreBrowser = installBrowserFixture()
  let respond!: (response: Response) => void
  const fetcher = spyOn(globalThis, 'fetch').mockImplementation(
    () =>
      new Promise((resolve) => {
        respond = resolve
      }),
  )
  configureClientAssetPolicy(null)
  const renderer = await create(view)
  try {
    expect(renderer.scene.findAllByProps({ name: 'scene' })).toHaveLength(0)
    expect(renderer.scene.findAllByProps({ name: 'loading' })).toHaveLength(1)
    await act(async () => {
      respond(Response.json({ origins: ['https://allowed.example'] }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(getClientAssetPolicy().origins).toEqual(['https://allowed.example'])
    expect(renderer.scene.findAllByProps({ name: 'scene' })).toHaveLength(1)
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error', cache: 'no-store' })
  } finally {
    await renderer.unmount()
    configureClientAssetPolicy(null)
    fetcher.mockRestore()
    restoreBrowser()
  }
})

test('does not mount a scene when the policy response is invalid', async () => {
  const restoreBrowser = installBrowserFixture()
  const fetcher = spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json({ origins: 'not-an-array' }),
  )
  const renderer = await create(view)
  try {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(renderer.scene.findAllByProps({ name: 'scene' })).toHaveLength(0)
    expect(renderer.scene.findAllByProps({ name: 'unavailable' })).toHaveLength(1)
  } finally {
    await renderer.unmount()
    configureClientAssetPolicy(null)
    fetcher.mockRestore()
    restoreBrowser()
  }
})
