import { describe, expect, it, vi, beforeAll } from 'vitest'

// Mock CATALOG_ITEMS with representative test data
const MOCK_CATALOG = [
  {
    id: 'sofa-modern',
    category: 'furniture',
    name: 'Modern Sofa',
    tags: ['seating', 'living-room'],
    thumbnail: '/items/sofa-modern/thumbnail.webp',
    src: '/items/sofa-modern/model.glb',
    scale: [1, 1, 1] as [number, number, number],
    offset: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    dimensions: [2.2, 0.9, 0.9] as [number, number, number],
  },
  {
    id: 'dining-table',
    category: 'furniture',
    name: 'Dining Table',
    tags: ['table', 'dining-room'],
    thumbnail: '/items/dining-table/thumbnail.webp',
    src: '/items/dining-table/model.glb',
    scale: [1, 1, 1] as [number, number, number],
    offset: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    dimensions: [1.6, 0.75, 0.9] as [number, number, number],
  },
  {
    id: 'ceiling-lamp',
    category: 'lighting',
    name: 'Ceiling Lamp',
    tags: ['lighting', 'ceiling'],
    thumbnail: '/items/ceiling-lamp/thumbnail.webp',
    src: '/items/ceiling-lamp/model.glb',
    scale: [1, 1, 1] as [number, number, number],
    offset: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    dimensions: [0.5, 0.3, 0.5] as [number, number, number],
    attachTo: 'ceiling' as const,
  },
  {
    id: 'wall-painting',
    category: 'decor',
    name: 'Wall Painting',
    tags: ['decor', 'wall'],
    thumbnail: '/items/wall-painting/thumbnail.webp',
    src: '/items/wall-painting/model.glb',
    scale: [1, 1, 1] as [number, number, number],
    offset: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    dimensions: [1, 0.8, 0.05] as [number, number, number],
    attachTo: 'wall' as const,
  },
  {
    id: 'kitchen-sink',
    category: 'kitchen',
    name: 'Kitchen Sink',
    tags: ['kitchen', 'plumbing'],
    thumbnail: '/items/kitchen-sink/thumbnail.webp',
    src: '/items/kitchen-sink/model.glb',
    scale: [1, 1, 1] as [number, number, number],
    offset: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    dimensions: [0.8, 0.85, 0.6] as [number, number, number],
  },
]

// Mock the catalog items module
vi.mock('../../../components/ui/item-catalog/catalog-items', () => ({
  CATALOG_ITEMS: MOCK_CATALOG,
}))

// Dynamic import after mock setup
let resolveCatalogSlug: typeof import('../ai-catalog-resolver').resolveCatalogSlug
let generateCatalogSummary: typeof import('../ai-catalog-resolver').generateCatalogSummary

beforeAll(async () => {
  const mod = await import('../ai-catalog-resolver')
  resolveCatalogSlug = mod.resolveCatalogSlug
  generateCatalogSummary = mod.generateCatalogSummary
})

describe('resolveCatalogSlug', () => {
  describe('exact ID match', () => {
    it('resolves an exact catalog ID', () => {
      const result = resolveCatalogSlug('sofa-modern')
      expect(result.matchType).toBe('exact')
      expect(result.asset).not.toBeNull()
      expect(result.asset!.id).toBe('sofa-modern')
    })

    it('resolves another exact ID', () => {
      const result = resolveCatalogSlug('ceiling-lamp')
      expect(result.matchType).toBe('exact')
      expect(result.asset!.id).toBe('ceiling-lamp')
    })
  })

  describe('name match', () => {
    it('resolves by exact name (case-insensitive)', () => {
      const result = resolveCatalogSlug('Modern Sofa')
      expect(result.matchType).toBe('name')
      expect(result.asset!.id).toBe('sofa-modern')
    })

    it('resolves name with different casing', () => {
      const result = resolveCatalogSlug('modern sofa')
      expect(result.matchType).toBe('name')
      expect(result.asset!.id).toBe('sofa-modern')
    })
  })

  describe('fuzzy match', () => {
    it('finds item by partial ID match', () => {
      const result = resolveCatalogSlug('sofa')
      expect(result.asset).not.toBeNull()
      expect(result.asset!.id).toBe('sofa-modern')
      expect(result.matchType).toBe('fuzzy')
    })

    it('finds item by partial name', () => {
      const result = resolveCatalogSlug('dining')
      expect(result.asset).not.toBeNull()
      expect(result.asset!.id).toBe('dining-table')
    })

    it('handles hyphenated slugs', () => {
      const result = resolveCatalogSlug('wall-painting')
      expect(result.matchType).toBe('exact')
      expect(result.asset!.id).toBe('wall-painting')
    })
  })

  describe('no match', () => {
    it('returns null for completely unknown slugs', () => {
      const result = resolveCatalogSlug('quantum-flux-capacitor')
      expect(result.asset).toBeNull()
      expect(result.matchType).toBe('none')
    })

    it('provides suggestions for kitchen-related slugs', () => {
      const result = resolveCatalogSlug('kitchen-stove')
      // Should find "kitchen" keyword in slug and suggest kitchen items
      if (result.asset === null) {
        expect(result.suggestions).toBeDefined()
        expect(result.suggestions!.length).toBeGreaterThan(0)
      }
    })
  })
})

describe('generateCatalogSummary', () => {
  it('generates a non-empty summary', () => {
    const summary = generateCatalogSummary()
    expect(summary).toBeTruthy()
    expect(summary.length).toBeGreaterThan(0)
  })

  it('includes catalog items by category', () => {
    const summary = generateCatalogSummary()
    expect(summary).toContain('[furniture]')
    expect(summary).toContain('sofa-modern')
    expect(summary).toContain('dining-table')
  })

  it('includes item dimensions', () => {
    const summary = generateCatalogSummary()
    // sofa-modern dimensions: 2.2x0.9x0.9
    expect(summary).toContain('2.2x0.9x0.9')
  })

  it('includes attach info for wall/ceiling items', () => {
    const summary = generateCatalogSummary()
    expect(summary).toContain('attach:ceiling')
    expect(summary).toContain('attach:wall')
  })
})
