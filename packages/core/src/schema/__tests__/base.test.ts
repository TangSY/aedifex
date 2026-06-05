import { describe, expect, test } from 'bun:test'
import { BaseNode } from '../base'

describe('BaseNode', () => {
  describe('defaults', () => {
    test('parse({id:"x"}) supplies object/type/parentId/visible/metadata defaults', () => {
      const parsed = BaseNode.parse({ id: 'x' })
      expect(parsed.id).toBe('x')
      expect(parsed.object).toBe('node')
      expect(parsed.type).toBe('node')
      expect(parsed.parentId).toBe(null)
      expect(parsed.visible).toBe(true)
      expect(parsed.metadata).toEqual({})
    })

    test('omitting visible yields true (the documented default)', () => {
      const parsed = BaseNode.parse({ id: 'x' })
      expect(parsed.visible).toBe(true)
    })

    test('omitting metadata yields empty object', () => {
      const parsed = BaseNode.parse({ id: 'x' })
      expect(parsed.metadata).toEqual({})
    })

    test('omitting parentId yields null (root node)', () => {
      const parsed = BaseNode.parse({ id: 'x' })
      expect(parsed.parentId).toBe(null)
    })
  })

  describe('explicit values override defaults', () => {
    test('explicit visible:false sticks', () => {
      const parsed = BaseNode.parse({ id: 'x', visible: false })
      expect(parsed.visible).toBe(false)
    })

    test('explicit parentId sticks', () => {
      const parsed = BaseNode.parse({ id: 'x', parentId: 'parent-1' })
      expect(parsed.parentId).toBe('parent-1')
    })

    test('explicit metadata sticks', () => {
      const parsed = BaseNode.parse({ id: 'x', metadata: { foo: 'bar' } })
      expect(parsed.metadata).toEqual({ foo: 'bar' })
    })

    test('explicit name is preserved', () => {
      const parsed = BaseNode.parse({ id: 'x', name: 'My Node' })
      expect(parsed.name).toBe('My Node')
    })
  })

  describe('idempotence', () => {
    test('parse(parse(x)) yields the same result', () => {
      const once = BaseNode.parse({ id: 'x' })
      const twice = BaseNode.parse(once)
      expect(twice).toEqual(once)
    })

    test('idempotent with explicit values', () => {
      const input = {
        id: 'x',
        parentId: 'p',
        visible: false,
        metadata: { kind: 'demo' },
        name: 'Demo',
      }
      const once = BaseNode.parse(input)
      const twice = BaseNode.parse(once)
      expect(twice).toEqual(once)
    })
  })

  describe('rejections', () => {
    test('parse() without id rejects', () => {
      expect(() => BaseNode.parse({})).toThrow()
    })

    test('parse with non-string id rejects', () => {
      expect(() => BaseNode.parse({ id: 123 })).toThrow()
    })

    test('parse with non-boolean visible rejects', () => {
      expect(() => BaseNode.parse({ id: 'x', visible: 'yes' })).toThrow()
    })
  })
})
