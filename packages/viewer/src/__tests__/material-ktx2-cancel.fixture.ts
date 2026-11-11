import { expect, spyOn, test } from 'bun:test'
import { configureClientAssetPolicy } from '@aedifex/core'
import { Texture } from 'three'
import { ensureKtx2Support, ktx2Loader } from '../lib/ktx2-loader'
import { createMaterial } from '../lib/materials'

test('policy change prevents a deferred unrestricted KTX2 request from starting', async () => {
  configureClientAssetPolicy(null)
  const detect = spyOn(ktx2Loader, 'detectSupport').mockReturnValue(ktx2Loader)
  const decoder = spyOn(ktx2Loader, 'loadAsync').mockResolvedValue(new Texture() as never)
  try {
    createMaterial({ texture: { url: 'https://example.org/pending-unrestricted.ktx2' } })
    expect(decoder).not.toHaveBeenCalled()
    configureClientAssetPolicy([])
    expect(ensureKtx2Support({})).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(decoder).not.toHaveBeenCalled()
  } finally {
    configureClientAssetPolicy(null)
    decoder.mockRestore()
    detect.mockRestore()
  }
})
