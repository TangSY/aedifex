import { expect, test } from 'bun:test'
import { areXRInputsNeutral } from './neutral-input'

function trackedHand() {
  const positions = new Map<string, { x: number; y: number; z: number }>([
    ['thumb-tip', { x: 0.1, y: 0.05, z: 0 }],
    ['index-finger-tip', { x: 0, y: 0.1, z: 0 }],
    ['wrist', { x: 0, y: 0, z: 0 }],
  ])
  for (const finger of ['middle', 'ring', 'pinky']) {
    positions.set(`${finger}-finger-tip`, { x: 0, y: 0.1, z: 0 })
    positions.set(`${finger}-finger-metacarpal`, { x: 0, y: 0.025, z: 0 })
  }
  let tracked = true
  const source = {
    hand: { get: (key: string) => key },
  } as unknown as XRInputSource
  const frame = {
    getPose: () => (tracked ? {} : null),
    getJointPose: (joint: string) =>
      positions.has(joint)
        ? { transform: { position: positions.get(joint) } }
        : null,
  } as unknown as XRFrame
  return {
    positions,
    neutral: () => areXRInputsNeutral([source], frame, {} as XRReferenceSpace),
    loseTracking: () => {
      tracked = false
    },
  }
}

test('open tracked hands can rearm, missing tracking cannot', () => {
  const hand = trackedHand()
  expect(hand.neutral()).toBe(true)
  hand.loseTracking()
  expect(hand.neutral()).toBe(false)
})

test('both selection pinch and locomotion pinch block rearming', () => {
  for (const joint of ['index-finger-tip', 'middle-finger-tip']) {
    const hand = trackedHand()
    hand.positions.set(joint, hand.positions.get('thumb-tip')!)
    expect(hand.neutral()).toBe(false)
  }
})

test('a held palm grip blocks rearming until a finger opens', () => {
  const hand = trackedHand()
  for (const finger of ['middle', 'ring', 'pinky'])
    hand.positions.set(`${finger}-finger-tip`, { x: 0, y: 0.04, z: 0 })
  expect(hand.neutral()).toBe(false)
  hand.positions.set('ring-finger-tip', { x: 0, y: 0.1, z: 0 })
  expect(hand.neutral()).toBe(true)
  hand.positions.delete('thumb-tip')
  expect(hand.neutral()).toBe(false)
})
