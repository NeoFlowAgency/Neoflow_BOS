import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSingle, mockRpc, mockInsert, mockSelect, mockEq, qb } = vi.hoisted(() => {
  const mockSingle = vi.fn()
  const mockRpc = vi.fn()
  const mockInsert = vi.fn().mockReturnThis()
  const mockSelect = vi.fn().mockReturnThis()
  const mockEq = vi.fn().mockReturnThis()
  const qb = {
    insert: mockInsert,
    select: mockSelect,
    eq: mockEq,
    single: mockSingle,
    then: (resolve) => resolve({ data: null, error: null }),
  }
  return { mockSingle, mockRpc, mockInsert, mockSelect, mockEq, qb }
})

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => qb),
    rpc: mockRpc,
  },
}))

import { createInvoice } from './invoiceService'

const baseInvoiceData = {
  discount_global: 0,
  discount_type: 'percent',
  notes: '',
  validity_days: 30,
  has_delivery: false,
  subtotal_ht: 100,
  total_tva: 20,
  total_ttc: 120,
}

const baseItems = [
  {
    product_id: 'prod-1',
    description: 'Article',
    quantity: 1,
    unit_price_ht: 100,
    tax_rate: 20,
    total_ht: 100,
  },
]

describe('createInvoice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInsert.mockReturnThis()
    mockSelect.mockReturnThis()
    mockEq.mockReturnThis()
    qb.then = (resolve) => resolve({ data: null, error: null })
  })

  it('throws if rpc fails to generate invoice number', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'num error' } })
    await expect(createInvoice('ws-1', 'user-1', 'cust-1', baseItems, baseInvoiceData)).rejects.toThrow(
      'numéro facture'
    )
  })

  it('throws if invoice insert fails', async () => {
    mockRpc.mockResolvedValueOnce({ data: { invoice_number: 'FAC-2024-001' }, error: null })
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'insert failed' } })
    await expect(createInvoice('ws-1', 'user-1', 'cust-1', baseItems, baseInvoiceData)).rejects.toThrow(
      'création facture'
    )
  })

  it('throws if invoice_items insert fails', async () => {
    mockRpc.mockResolvedValueOnce({ data: { invoice_number: 'FAC-2024-001' }, error: null })
    mockSingle.mockResolvedValueOnce({ data: { id: 'inv-1' }, error: null })
    qb.then = (resolve) => resolve({ data: null, error: { message: 'items failed' } })
    await expect(createInvoice('ws-1', 'user-1', 'cust-1', baseItems, baseInvoiceData)).rejects.toThrow(
      'lignes facture'
    )
  })

  it('returns created invoice on success', async () => {
    mockRpc.mockResolvedValueOnce({ data: { invoice_number: 'FAC-2024-001' }, error: null })
    const fakeInvoice = { id: 'inv-1', invoice_number: 'FAC-2024-001', status: 'brouillon' }
    mockSingle.mockResolvedValueOnce({ data: fakeInvoice, error: null })
    qb.then = (resolve) => resolve({ data: null, error: null })
    const result = await createInvoice('ws-1', 'user-1', 'cust-1', baseItems, baseInvoiceData)
    expect(result).toEqual(fakeInvoice)
  })

  it('creates invoice with status brouillon', async () => {
    mockRpc.mockResolvedValueOnce({ data: { invoice_number: 'FAC-001' }, error: null })
    mockSingle.mockResolvedValueOnce({ data: { id: 'inv-2' }, error: null })
    qb.then = (resolve) => resolve({ data: null, error: null })
    await createInvoice('ws-1', 'user-1', 'cust-1', baseItems, baseInvoiceData)
    const insertArgs = mockInsert.mock.calls[0][0]
    expect(insertArgs.status).toBe('brouillon')
  })

  it('assigns correct workspace_id to the invoice', async () => {
    mockRpc.mockResolvedValueOnce({ data: { invoice_number: 'FAC-001' }, error: null })
    mockSingle.mockResolvedValueOnce({ data: { id: 'inv-3' }, error: null })
    qb.then = (resolve) => resolve({ data: null, error: null })
    await createInvoice('my-ws', 'user-1', 'cust-1', baseItems, baseInvoiceData)
    const insertArgs = mockInsert.mock.calls[0][0]
    expect(insertArgs.workspace_id).toBe('my-ws')
  })

  it('uses correct year in rpc call', async () => {
    mockRpc.mockResolvedValueOnce({ data: { invoice_number: 'FAC-001' }, error: null })
    mockSingle.mockResolvedValueOnce({ data: { id: 'inv-4' }, error: null })
    qb.then = (resolve) => resolve({ data: null, error: null })
    await createInvoice('ws-1', 'user-1', 'cust-1', baseItems, baseInvoiceData)
    expect(mockRpc).toHaveBeenCalledWith('get_next_invoice_number', expect.objectContaining({
      p_workspace_id: 'ws-1',
      p_year: new Date().getFullYear(),
    }))
  })
})
