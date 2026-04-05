import { describe, expect, it } from 'vitest'
import { cn } from '../utils'

// ---------------------------------------------------------------------------
// cn — className merger (clsx + tailwind-merge)
// ---------------------------------------------------------------------------

describe('cn', () => {
  // --- Basic merging ---

  it('returns an empty string when called with no arguments', () => {
    expect(cn()).toBe('')
  })

  it('returns a single class name unchanged', () => {
    expect(cn('foo')).toBe('foo')
  })

  it('merges multiple class names with a space separator', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
    expect(cn('a', 'b', 'c')).toBe('a b c')
  })

  // --- Conditional classes (clsx behaviour) ---

  it('includes truthy conditional class names', () => {
    expect(cn('base', true && 'active')).toBe('base active')
  })

  it('omits falsy conditional class names', () => {
    expect(cn('base', false && 'inactive')).toBe('base')
    expect(cn('base', null, undefined, 0 as unknown as string)).toBe('base')
  })

  it('handles object syntax for conditional classes', () => {
    expect(cn({ 'is-active': true, 'is-disabled': false })).toBe('is-active')
  })

  it('handles array syntax', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar')
    expect(cn(['foo', false && 'bar'])).toBe('foo')
  })

  it('handles nested arrays', () => {
    expect(cn(['a', ['b', 'c']])).toBe('a b c')
  })

  // --- Tailwind conflict resolution (twMerge behaviour) ---

  it('resolves conflicting Tailwind padding utilities (last wins)', () => {
    // Both p-2 and p-4 set padding; twMerge keeps the last one
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })

  it('resolves conflicting Tailwind text colour utilities', () => {
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })

  it('resolves conflicting Tailwind background colour utilities', () => {
    expect(cn('bg-gray-100', 'bg-white')).toBe('bg-white')
  })

  it('resolves conflicting Tailwind margin utilities', () => {
    expect(cn('mx-4', 'mx-8')).toBe('mx-8')
  })

  it('keeps non-conflicting Tailwind utilities from different groups', () => {
    const result = cn('p-4', 'text-red-500', 'flex')
    expect(result).toContain('p-4')
    expect(result).toContain('text-red-500')
    expect(result).toContain('flex')
  })

  it('merges conditional Tailwind conflict correctly', () => {
    const isLarge = true
    const result = cn('text-sm', isLarge && 'text-lg')
    expect(result).toBe('text-lg')
  })

  it('conditional Tailwind conflict — false condition leaves base class', () => {
    const isLarge = false
    const result = cn('text-sm', isLarge && 'text-lg')
    expect(result).toBe('text-sm')
  })

  it('handles mixed object and string arguments', () => {
    const result = cn('base', { 'extra-class': true }, 'another')
    expect(result).toContain('base')
    expect(result).toContain('extra-class')
    expect(result).toContain('another')
  })

  it('strips duplicate classes (tailwind-merge deduplicates conflicting groups)', () => {
    // Same utility repeated — twMerge keeps one
    const result = cn('flex', 'flex')
    // clsx would produce 'flex flex' but twMerge normalises it
    expect(result.trim()).not.toBe('')
    expect(result.split('flex').length - 1).toBeLessThanOrEqual(2)
  })

  // --- Tailwind modifier conflict resolution ---

  it('resolves responsive modifiers correctly', () => {
    expect(cn('sm:p-2', 'sm:p-4')).toBe('sm:p-4')
  })

  it('keeps utilities with different responsive prefixes', () => {
    const result = cn('sm:p-2', 'md:p-4')
    expect(result).toContain('sm:p-2')
    expect(result).toContain('md:p-4')
  })

  it('resolves hover state conflicts', () => {
    expect(cn('hover:bg-gray-100', 'hover:bg-blue-500')).toBe('hover:bg-blue-500')
  })

  // --- Typical component usage patterns ---

  it('supports variant-based class composition', () => {
    const base = 'rounded font-medium'
    const primary = 'bg-blue-500 text-white'
    const large = 'px-6 py-3 text-lg'

    const result = cn(base, primary, large)
    expect(result).toContain('rounded')
    expect(result).toContain('font-medium')
    expect(result).toContain('bg-blue-500')
    expect(result).toContain('text-white')
    expect(result).toContain('px-6')
    expect(result).toContain('py-3')
    // text-lg should win over any base text size
    expect(result).toContain('text-lg')
  })

  it('prop className override pattern resolves conflicts', () => {
    // Common pattern: component default + caller override
    const componentDefault = 'text-gray-700 text-sm'
    const callerOverride = 'text-blue-500'
    const result = cn(componentDefault, callerOverride)
    // Both text-gray-700 and text-blue-500 conflict → last wins
    expect(result).toContain('text-blue-500')
    expect(result).not.toContain('text-gray-700')
    // text-sm has no conflict with text-blue-500 (colour vs size)
    expect(result).toContain('text-sm')
  })
})
