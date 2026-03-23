import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockThen = vi.fn()
const mockEq = vi.fn().mockReturnThis()
const mockSelect = vi.fn().mockReturnThis()

const qb = { select: mockSelect, eq: mockEq, then: mockThen }

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => qb),
  },
}))

import { getStockAlerts } from './stockService'
import { supabase } from '../lib/supabase'

function makeLevels(overrides = []) {
  return overrides
}

describe('getStockAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEq.mockReturnThis()
    mockSelect.mockReturnThis()
  })

  it('returns empty arrays when no stock levels', async () => {
    mockThen.mockImplementationOnce((resolve) => resolve({ data: [], error: null }))
    const { outOfStock, lowStock } = await getStockAlerts('ws-1')
    expect(outOfStock).toHaveLength(0)
    expect(lowStock).toHaveLength(0)
  })

  it('throws on supabase error', async () => {
    mockThen.mockImplementationOnce((resolve) => resolve({ data: null, error: { message: 'DB error' } }))
    await expect(getStockAlerts('ws-1')).rejects.toThrow('DB error')
  })

  it('classifies product with 0 available as outOfStock', async () => {
    const levels = [
      {
        quantity: 0,
        reserved_quantity: 0,
        product: { id: 'p1', name: 'Prod 1', reference: 'P001', is_archived: false },
        location: { name: 'Entrepôt', type: 'warehouse' },
      },
    ]
    mockThen.mockImplementationOnce((resolve) => resolve({ data: levels, error: null }))
    const { outOfStock, lowStock } = await getStockAlerts('ws-1')
    expect(outOfStock).toHaveLength(1)
    expect(outOfStock[0].product.name).toBe('Prod 1')
    expect(lowStock).toHaveLength(0)
  })

  it('classifies product with negative available as outOfStock', async () => {
    const levels = [
      {
        quantity: 2,
        reserved_quantity: 5,
        product: { id: 'p2', name: 'Prod 2', reference: 'P002', is_archived: false },
        location: { name: 'Entrepôt', type: 'warehouse' },
      },
    ]
    mockThen.mockImplementationOnce((resolve) => resolve({ data: levels, error: null }))
    const { outOfStock } = await getStockAlerts('ws-1')
    expect(outOfStock).toHaveLength(1)
  })

  it('classifies product below threshold as lowStock', async () => {
    const levels = [
      {
        quantity: 2,
        reserved_quantity: 0,
        product: { id: 'p3', name: 'Prod 3', reference: 'P003', is_archived: false },
        location: { name: 'Entrepôt', type: 'warehouse' },
      },
    ]
    mockThen.mockImplementationOnce((resolve) => resolve({ data: levels, error: null }))
    const { outOfStock, lowStock } = await getStockAlerts('ws-1', 3)
    expect(lowStock).toHaveLength(1)
    expect(lowStock[0].product.name).toBe('Prod 3')
    expect(outOfStock).toHaveLength(0)
  })

  it('does not classify product at or above threshold', async () => {
    const levels = [
      {
        quantity: 5,
        reserved_quantity: 0,
        product: { id: 'p4', name: 'Prod 4', reference: 'P004', is_archived: false },
        location: { name: 'Entrepôt', type: 'warehouse' },
      },
    ]
    mockThen.mockImplementationOnce((resolve) => resolve({ data: levels, error: null }))
    const { outOfStock, lowStock } = await getStockAlerts('ws-1', 3)
    expect(outOfStock).toHaveLength(0)
    expect(lowStock).toHaveLength(0)
  })

  it('skips archived products', async () => {
    const levels = [
      {
        quantity: 0,
        reserved_quantity: 0,
        product: { id: 'p5', name: 'Archived', reference: 'P005', is_archived: true },
        location: { name: 'Entrepôt', type: 'warehouse' },
      },
    ]
    mockThen.mockImplementationOnce((resolve) => resolve({ data: levels, error: null }))
    const { outOfStock, lowStock } = await getStockAlerts('ws-1')
    expect(outOfStock).toHaveLength(0)
    expect(lowStock).toHaveLength(0)
  })

  it('skips levels with no product', async () => {
    const levels = [
      { quantity: 0, reserved_quantity: 0, product: null, location: null },
    ]
    mockThen.mockImplementationOnce((resolve) => resolve({ data: levels, error: null }))
    const { outOfStock, lowStock } = await getStockAlerts('ws-1')
    expect(outOfStock).toHaveLength(0)
    expect(lowStock).toHaveLength(0)
  })

  it('aggregates multiple locations for the same product', async () => {
    const levels = [
      {
        quantity: 1,
        reserved_quantity: 0,
        product: { id: 'p6', name: 'Multi', reference: 'P006', is_archived: false },
        location: { name: 'Entrepôt A', type: 'warehouse' },
      },
      {
        quantity: 1,
        reserved_quantity: 0,
        product: { id: 'p6', name: 'Multi', reference: 'P006', is_archived: false },
        location: { name: 'Entrepôt B', type: 'warehouse' },
      },
    ]
    mockThen.mockImplementationOnce((resolve) => resolve({ data: levels, error: null }))
    // Total available = 2, threshold = 3 → lowStock
    const { outOfStock, lowStock } = await getStockAlerts('ws-1', 3)
    expect(lowStock).toHaveLength(1)
    expect(lowStock[0].totalAvailable).toBe(2)
    expect(lowStock[0].locations).toHaveLength(2)
    expect(outOfStock).toHaveLength(0)
  })

  it('uses custom threshold', async () => {
    const levels = [
      {
        quantity: 4,
        reserved_quantity: 0,
        product: { id: 'p7', name: 'Prod 7', reference: 'P007', is_archived: false },
        location: { name: 'Entrepôt', type: 'warehouse' },
      },
    ]
    mockThen.mockImplementationOnce((resolve) => resolve({ data: levels, error: null }))
    // threshold=5: 4 < 5 → lowStock
    const { lowStock } = await getStockAlerts('ws-1', 5)
    expect(lowStock).toHaveLength(1)
  })
})
