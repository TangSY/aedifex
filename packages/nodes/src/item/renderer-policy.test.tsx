import { expect, spyOn, test } from 'bun:test'
import { configureClientAssetPolicy, getClientAssetPolicy, ItemNode, useScene } from '@aedifex/core'
import { resolveCdnUrl } from '@aedifex/viewer'
import { useLoader } from '@react-three/fiber'
import { act } from '@react-three/test-renderer'
import { Group } from 'three'
import { installMountedScene, mount, settle } from '../__tests__/harness'
import { itemDefinition } from './definition'
import { guardedItemModelKey, ItemGLTFLoader } from './model-loader'
import { ItemRenderer } from './renderer'

installMountedScene({ nodes: [itemDefinition] })

test('a mounted item uses a new loader cache key when the origin policy changes', async () => {
  configureClientAssetPolicy(null)
  const node = ItemNode.parse({
    id: 'item_policy-test',
    asset: {
      id: 'policy-test',
      name: 'Test',
      category: 'object',
      src: 'https://allowed.example/model.glb',
      thumbnail: '',
      dimensions: [1, 1, 1],
    },
  })
  useScene.setState({ nodes: { [node.id]: node } })
  const requests: string[] = []
  const loader = spyOn(ItemGLTFLoader.prototype, 'load').mockImplementation((url, onLoad) => {
    requests.push(url)
    const scene = new Group()
    onLoad({
      scene,
      scenes: [scene],
      animations: [],
      cameras: [],
      asset: { version: '2.0' },
      parser: {},
      userData: {},
    } as never)
  })
  const url = resolveCdnUrl(node.asset.src)!
  let guarded = ''
  try {
    useLoader.preload(ItemGLTFLoader, url)
    await Promise.resolve()
    const renderer = await mount(<ItemRenderer node={node} />)
    expect(requests).toContain(url)
    await act(async () => {
      configureClientAssetPolicy(['https://allowed.example'])
    })
    guarded = guardedItemModelKey({
      source: node.asset.src,
      resolvedUrl: url,
      version: getClientAssetPolicy().version,
    })
    await settle(renderer)
    expect(requests).toContain(guarded)
    expect(guarded).not.toBe(url)
    await renderer.unmount()
  } finally {
    useLoader.clear(ItemGLTFLoader, url)
    if (guarded) useLoader.clear(ItemGLTFLoader, guarded)
    loader.mockRestore()
    configureClientAssetPolicy(null)
  }
})
