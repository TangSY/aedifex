import { expect, test } from 'bun:test'
import { GuideScaleReference } from '@aedifex/core'
import { z } from 'zod'
import { createGuideScaleReference, formatReferenceScaleLabel } from '../../lib/reference-scale'
import {
  formatFloorplanNumber,
  getReferenceScaleInputError,
  parseReferenceScaleLength,
} from './floorplan-panel'

const Core106GuideScaleReference = z.object({
  start: z.tuple([z.number(), z.number()]),
  end: z.tuple([z.number(), z.number()]),
  realLengthMeters: z.number().positive(),
  measuredLengthUnits: z.number().positive(),
  metersPerUnit: z.number().positive(),
  label: z.string(),
})

function runtimeScaleReference(overrides: Record<string, unknown> = {}): GuideScaleReference {
  return {
    start: [0, 0],
    end: [1, 0],
    realLengthMeters: 2.75,
    measuredLengthUnits: 1,
    metersPerUnit: 2.75,
    label: '2.75 m',
    ...overrides,
  } as unknown as GuideScaleReference
}

test('floor-plan reference scales parse with the scoped locale', () => {
  expect(parseReferenceScaleLength('1,000', 'meters', 'fr')).toBe(1)
  expect(parseReferenceScaleLength('1,000', 'meters', 'en')).toBe(1000)
})

test('floor-plan reference scales display with the scoped locale', () => {
  expect(formatFloorplanNumber(2.75, 'fr')).toBe('2,75')
  expect(formatFloorplanNumber(2.75, 'en')).toBe('2.75')
})

test('reference-scale scenes remain compatible and format numeric and legacy labels', () => {
  const reference = createGuideScaleReference(
    {
      start: [0, 0],
      end: [1, 0],
      realLengthMeters: 2.75,
      measuredLengthUnits: 1,
      metersPerUnit: 2.75,
    },
    2.75,
    'meters',
  )

  expect(reference).toEqual({
    start: [0, 0],
    end: [1, 0],
    realLengthMeters: 2.75,
    measuredLengthUnits: 1,
    metersPerUnit: 2.75,
    displayLength: 2.75,
    displayUnit: 'meters',
    label: '2.75 m',
  })
  expect(Core106GuideScaleReference.safeParse(reference).success).toBe(true)
  expect(formatReferenceScaleLabel(reference, 'fr')).toBe('2,75 m')
  expect(formatReferenceScaleLabel(reference, 'en')).toBe('2.75 m')
  const legacyFrenchReference = GuideScaleReference.parse({
    start: [0, 0],
    end: [1, 0],
    realLengthMeters: 2.75,
    measuredLengthUnits: 1,
    metersPerUnit: 2.75,
    label: '2,75 m',
  })
  expect(formatReferenceScaleLabel(legacyFrenchReference, 'en')).toBe('2.75 m')
  expect(
    formatReferenceScaleLabel(
      GuideScaleReference.parse({
        ...legacyFrenchReference,
        label: '2.75 m',
      }),
      'fr',
    ),
  ).toBe('2,75 m')
  expect(
    formatReferenceScaleLabel(
      GuideScaleReference.parse({
        ...legacyFrenchReference,
        label: 'Known span',
      }),
      'fr',
    ),
  ).toBe('Known span')
})

test('oversized legacy reference labels bypass parsing within the input budget', () => {
  const label = `${'1, '.repeat(34_000)}?`
  const reference = runtimeScaleReference({ label })
  const startedAt = performance.now()
  const formatted = formatReferenceScaleLabel(reference, 'en')
  const elapsed = performance.now() - startedAt

  expect(formatted).toBe(label)
  expect(elapsed).toBeLessThan(50)
})

test('reference-scale labels tolerate malformed persisted values', () => {
  expect(formatReferenceScaleLabel(runtimeScaleReference({ label: 42 }), 'en')).toBe('42')
  expect(formatReferenceScaleLabel(runtimeScaleReference({ label: null }), 'en')).toBe('')
  const malformedLabel = JSON.parse('{"toString":null,"valueOf":null}')
  expect(formatReferenceScaleLabel(runtimeScaleReference({ label: malformedLabel }), 'en')).toBe('')
  expect(
    formatReferenceScaleLabel(
      runtimeScaleReference({
        displayLength: 2.75,
        displayUnit: '__proto__',
        label: 'fallback',
      }),
      'en',
    ),
  ).toBe('fallback')
  expect(
    formatReferenceScaleLabel(
      runtimeScaleReference({
        displayLength: 2.75,
        displayUnit: 'constructor',
        label: 'fallback',
      }),
      'en',
    ),
  ).toBe('fallback')
  expect(
    formatReferenceScaleLabel(
      runtimeScaleReference({
        displayLength: Number.POSITIVE_INFINITY,
        displayUnit: 'meters',
        label: 'fallback',
      }),
      'en',
    ),
  ).toBe('fallback')
  expect(
    formatReferenceScaleLabel(
      runtimeScaleReference({
        displayLength: Number.NaN,
        displayUnit: 'meters',
        label: 'fallback',
      }),
      'en',
    ),
  ).toBe('fallback')
})

test('reference-scale schema caps persisted display lengths', () => {
  expect(
    GuideScaleReference.safeParse(
      runtimeScaleReference({
        displayLength: 1_000_000,
        displayUnit: 'meters',
      }),
    ).success,
  ).toBe(true)
  expect(
    GuideScaleReference.safeParse(
      runtimeScaleReference({
        displayLength: 1_000_001,
        displayUnit: 'meters',
      }),
    ).success,
  ).toBe(false)
})

test('reference-scale input respects the persisted schema limit and locale', () => {
  const error = (raw: string, unit: 'meters' | 'feet' = 'meters', locale = 'en') =>
    getReferenceScaleInputError({ raw, unit, locale })
  expect(error('1000000')).toBeNull()
  expect(error('2.75', 'feet')).toBeNull()
  expect(error('1000001')).toContain('1000000')
  expect(error('0')).toBe('Length must be greater than 0.')
  expect(error('')).toBe('Enter the real length of the line.')
  expect(error('not a number')).toContain('Enter a length')
  expect(error('1,5', 'meters', 'fr')).toBeNull()
})

test('reference-scale creation refuses non-finite and oversized display lengths', () => {
  const base = {
    start: [0, 0] as [number, number],
    end: [1, 0] as [number, number],
    realLengthMeters: 1,
    measuredLengthUnits: 1,
    metersPerUnit: 1,
  }
  for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1_000_001]) {
    expect(() => createGuideScaleReference(base, value, 'meters')).toThrow()
  }
  expect(
    GuideScaleReference.safeParse(createGuideScaleReference(base, 1_000_000, 'meters')).success,
  ).toBe(true)
})

test('legacy scale labels accept repeated Unicode whitespace between number groups', () => {
  expect(formatReferenceScaleLabel(runtimeScaleReference({ label: '1  234,5 m' }), 'en')).toBe(
    '1234.5 m',
  )
  expect(formatReferenceScaleLabel(runtimeScaleReference({ label: '1 \u00a0234 cm' }), 'en')).toBe(
    '1234 cm',
  )
})
