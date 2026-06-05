import { describe, expect, test } from 'bun:test'
import { WindowNode } from '../nodes/window'

const MIN_WINDOW = { id: 'window_a', type: 'window' as const }

describe('WindowNode.parse', () => {
  describe('defaults', () => {
    test('minimal window supplies all dimension defaults', () => {
      const w = WindowNode.parse(MIN_WINDOW)
      // width and height both default to 1.5 (same as schema)
      expect(w.width).toBe(1.5)
      expect(w.height).toBe(1.5)
    })

    test('default window family is fixed', () => {
      const w = WindowNode.parse(MIN_WINDOW)
      expect(w.windowType).toBe('fixed')
      expect(w.openingKind).toBe('window')
    })

    test('default operationState is 0 (closed)', () => {
      const w = WindowNode.parse(MIN_WINDOW)
      expect(w.operationState).toBe(0)
    })

    test('default columnRatios / rowRatios are [1] (single pane)', () => {
      const w = WindowNode.parse(MIN_WINDOW)
      expect(w.columnRatios).toEqual([1])
      expect(w.rowRatios).toEqual([1])
    })

    test('default sill is true; sillDepth=0.08, sillThickness=0.03', () => {
      const w = WindowNode.parse(MIN_WINDOW)
      expect(w.sill).toBe(true)
      expect(w.sillDepth).toBe(0.08)
      expect(w.sillThickness).toBe(0.03)
    })

    test('idempotent', () => {
      const once = WindowNode.parse(MIN_WINDOW)
      const twice = WindowNode.parse(once)
      expect(twice).toEqual(once)
    })
  })

  describe('windowType enum', () => {
    test('accepts every documented type', () => {
      const types = [
        'fixed',
        'sliding',
        'casement',
        'awning',
        'hopper',
        'single-hung',
        'double-hung',
        'bay',
        'bow',
        'louvered',
      ]
      for (const t of types) {
        const w = WindowNode.parse({ ...MIN_WINDOW, windowType: t })
        expect(w.windowType).toBe(t as typeof w.windowType)
      }
    })

    test('rejects unknown windowType', () => {
      expect(() => WindowNode.parse({ ...MIN_WINDOW, windowType: 'porthole' })).toThrow()
    })
  })

  describe('operationState range', () => {
    test('accepts 0 / 0.5 / 1', () => {
      expect(WindowNode.parse({ ...MIN_WINDOW, operationState: 0 }).operationState).toBe(0)
      expect(WindowNode.parse({ ...MIN_WINDOW, operationState: 0.5 }).operationState).toBe(0.5)
      expect(WindowNode.parse({ ...MIN_WINDOW, operationState: 1 }).operationState).toBe(1)
    })

    test('rejects negative or > 1', () => {
      expect(() => WindowNode.parse({ ...MIN_WINDOW, operationState: -0.01 })).toThrow()
      expect(() => WindowNode.parse({ ...MIN_WINDOW, operationState: 1.01 })).toThrow()
    })
  })

  describe('openingCornerRadii tuple', () => {
    test('rejects 3-element tuple (must be 4)', () => {
      expect(() =>
        WindowNode.parse({ ...MIN_WINDOW, openingCornerRadii: [0.1, 0.1, 0.1] }),
      ).toThrow()
    })

    test('accepts 4-element tuple', () => {
      const w = WindowNode.parse({
        ...MIN_WINDOW,
        openingCornerRadii: [0.2, 0.2, 0.2, 0.2],
      })
      expect(w.openingCornerRadii).toEqual([0.2, 0.2, 0.2, 0.2])
    })
  })

  describe('width vs height (both can be set independently)', () => {
    test('explicit width overrides default but height remains default', () => {
      const w = WindowNode.parse({ ...MIN_WINDOW, width: 3.0 })
      expect(w.width).toBe(3.0)
      expect(w.height).toBe(1.5) // unchanged default
    })

    test('explicit height overrides default but width remains default', () => {
      const w = WindowNode.parse({ ...MIN_WINDOW, height: 2.4 })
      expect(w.height).toBe(2.4)
      expect(w.width).toBe(1.5)
    })
  })
})
