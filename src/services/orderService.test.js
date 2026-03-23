import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSingle, mockRpc, mockInsert, mockSelect, mockEq, mockOrder, qb } = vi.hoisted(() => {
  const mockSingle = vi.fn()
  const mockRpc = vi.fn()
  const mockInsert = vi.fn().mockReturnThis()
  const mockSelect = vi.fn().mockReturnThis()
  const mockEq = vi.fn().mockReturnThis()
  const mockOrder = vi.fn().mockReturnThis()
  const qb = {
    select: mockSelect,
    insert: mockInsert,
    eq: mockEq,
    order: mockOrder,
    single: mockSingle,
    then: (resolve) => resolve({ data: [], error: null }),
  }
  return { mockSingle, mockRpc, mockInsert, mockSelect, mockEq, mockOrder, qb }
})

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => qb),
    rpc: mockRpc,
  },
}))

import { createOrder, listOrders } from './orderService'
import { supabase } from '../lib/supabase'

const baseOrderData = {
  order_type: 'standard',
  status: 'confirme',
  source: 'direct',
  subtotal_ht: 100,
  total_tva: 20,
  total_ttc: 120,
}

const baseItems = [
  {
    product_id: 'prod-1',
    description: 'Article test',
    quantity: 2,
    unit_price_ht: 50,
    tax_rate: 20,
    total_ht: 100,
  },
]

describe('createOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInsert.mockReturnThis()
    mockSelect.mockReturnThis()
    mockEq.mockReturnThis()
    qb.then = (resolve) => resolve({ data: [], error: null })
  })

  it('throws if rpc fails to generate order number', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc error' } })
    await expect(createOrder('ws-1', 'user-1', null, baseItems, baseOrderData)).rejects.toThrow(
      'Erreur generation numero commande'
    )
  })

  it('throws if order insert fails', async () => {
    mockRpc.mockResolvedValueOnce({ data: { order_number: 'CMD-2024-001' }, error: null })
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'Insert failed' } })
    await expect(createOrder('ws-1', 'user-1', null, baseItems, baseOrderData)).rejects.toThrow(
      'Erreur creation commande'
    )
  })

  it('throws if order_items insert fails', async () => {
    mockRpc.mockResolvedValueOnce({ data: { order_number: 'CMD-2024-001' }, error: null })
    mockSingle.mockResolvedValueOnce({ data: { id: 'order-1' }, error: null })
    qb.then = (resolve) => resolve({ data: null, error: { message: 'Items failed' } })
    await expect(createOrder('ws-1', 'user-1', null, baseItems, baseOrderData)).rejects.toThrow(
      'Erreur ajout lignes commande'
    )
  })

  it('returns the created order on success', async () => {
    mockRpc.mockResolvedValueOnce({ data: { order_number: 'CMD-2024-001' }, error: null })
    const fakeOrder = { id: 'order-1', order_number: 'CMD-2024-001' }
    mockSingle.mockResolvedValueOnce({ data: fakeOrder, error: null })
    qb.then = (resolve) => resolve({ data: { id: 'item-1' }, error: null })
    const result = await createOrder('ws-1', 'user-1', 'cust-1', baseItems, baseOrderData)
    expect(result).toEqual(fakeOrder)
  })

  it('sets remaining_amount equal to total_ttc', async () => {
    mockRpc.mockResolvedValueOnce({ data: { order_number: 'CMD-001' }, error: null })
    mockSingle.mockResolvedValueOnce({ data: { id: 'o1' }, error: null })
    qb.then = (resolve) => resolve({ data: null, error: null })
    await createOrder('ws-1', 'user-1', null, baseItems, baseOrderData)
    const insertArgs = mockInsert.mock.calls[0][0]
    expect(insertArgs.remaining_amount).toBe(baseOrderData.total_ttc)
  })

  it('uses customer_id null when not provided', async () => {
    mockRpc.mockResolvedValueOnce({ data: { order_number: 'CMD-001' }, error: null })
    mockSingle.mockResolvedValueOnce({ data: { id: 'o2' }, error: null })
    qb.then = (resolve) => resolve({ data: null, error: null })
    await createOrder('ws-1', 'user-1', null, baseItems, baseOrderData)
    const insertArgs = mockInsert.mock.calls[0][0]
    expect(insertArgs.customer_id).toBeNull()
  })
})

describe('listOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEq.mockReturnThis()
    mockSelect.mockReturnThis()
    mockOrder.mockReturnThis()
    qb.then = (resolve) => resolve({ data: [], error: null })
  })

  it('returns empty array on no data', async () => {
    qb.then = (resolve) => resolve({ data: null, error: null })
    const result = await listOrders('ws-1')
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(0)
  })

  it('throws on error', async () => {
    qb.then = (resolve) => resolve({ data: null, error: { message: 'load error' } })
    await expect(listOrders('ws-1')).rejects.toThrow()
  })

  it('returns orders array', async () => {
    const orders = [{ id: 'o1' }, { id: 'o2' }]
    qb.then = (resolve) => resolve({ data: orders, error: null })
    const result = await listOrders('ws-1')
    expect(result).toEqual(orders)
  })
})
