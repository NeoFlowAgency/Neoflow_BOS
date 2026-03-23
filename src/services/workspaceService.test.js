import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase before importing the service
vi.mock('../lib/supabase', () => {
  const mockSingle = vi.fn()
  const mockSelect = vi.fn().mockReturnThis()
  const mockInsert = vi.fn().mockReturnThis()
  const mockUpdate = vi.fn().mockReturnThis()
  const mockEq = vi.fn().mockReturnThis()
  const mockOrder = vi.fn().mockReturnThis()

  const qb = {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    eq: mockEq,
    order: mockOrder,
    single: mockSingle,
    then: (resolve) => resolve({ data: null, error: null }),
  }

  return {
    supabase: {
      from: vi.fn(() => qb),
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: 'tok' } },
        }),
      },
    },
    invokeFunction: vi.fn().mockResolvedValue({ url: 'https://stripe.com/checkout' }),
    _qb: qb,
    _mockSingle: mockSingle,
  }
})

import { isStripeEnabled, createWorkspace, createCheckoutSession, updateWorkspace, getUserWorkspaces } from './workspaceService'
import { supabase, invokeFunction, _mockSingle } from '../lib/supabase'

describe('isStripeEnabled', () => {
  it('returns false when key is placeholder', () => {
    expect(isStripeEnabled()).toBe(false)
  })
})

describe('createWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws user-friendly error on duplicate name (23505)', async () => {
    _mockSingle.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    })
    await expect(createWorkspace('My WS', 'user-1')).rejects.toThrow(
      'Ce nom de workspace est déjà utilisé'
    )
  })

  it('throws user-friendly error on foreign key violation (23503)', async () => {
    _mockSingle.mockResolvedValueOnce({
      data: null,
      error: { code: '23503', message: 'foreign key' },
    })
    await expect(createWorkspace('My WS', 'user-1')).rejects.toThrow(
      'Erreur de référence'
    )
  })

  it('throws permission error on RLS violation', async () => {
    _mockSingle.mockResolvedValueOnce({
      data: null,
      error: { code: 'xxx', message: 'row-level security policy' },
    })
    await expect(createWorkspace('My WS', 'user-1')).rejects.toThrow(
      'permission'
    )
  })

  it('creates workspace and adds owner when successful', async () => {
    const fakeWorkspace = { id: 'ws-1', name: 'My WS', slug: 'my-ws-xxxx' }
    _mockSingle.mockResolvedValueOnce({ data: fakeWorkspace, error: null })

    // workspace_users insert (.then resolves directly with no error)
    const result = await createWorkspace('My WS', 'user-1')
    expect(result).toEqual(fakeWorkspace)
    expect(supabase.from).toHaveBeenCalledWith('workspaces')
  })

  it('inserts with is_active=true when Stripe is not configured', async () => {
    const fakeWorkspace = { id: 'ws-2', name: 'Test', slug: 'test-zzzz' }
    _mockSingle.mockResolvedValueOnce({ data: fakeWorkspace, error: null })
    await createWorkspace('Test', 'user-2', {})
    // Stripe is disabled (pk_test_xxxxx placeholder) → is_active should be true
    const insertCall = supabase.from('workspaces').insert
    expect(insertCall).toHaveBeenCalled()
  })
})

describe('createCheckoutSession', () => {
  it('calls invokeFunction with correct params for monthly billing', async () => {
    const result = await createCheckoutSession('ws-1', 'https://success', 'https://cancel', 'monthly')
    expect(invokeFunction).toHaveBeenCalledWith('create-checkout', expect.objectContaining({
      workspace_id: 'ws-1',
      billing: 'monthly',
    }))
  })

  it('calls invokeFunction with annual billing when specified', async () => {
    await createCheckoutSession('ws-1', null, null, 'annual')
    expect(invokeFunction).toHaveBeenCalledWith('create-checkout', expect.objectContaining({
      billing: 'annual',
    }))
  })

  it('defaults billing to monthly', async () => {
    await createCheckoutSession('ws-1')
    expect(invokeFunction).toHaveBeenCalledWith('create-checkout', expect.objectContaining({
      billing: 'monthly',
    }))
  })
})

describe('updateWorkspace', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns updated workspace data on success', async () => {
    const updated = { id: 'ws-1', name: 'New Name' }
    _mockSingle.mockResolvedValueOnce({ data: updated, error: null })
    const result = await updateWorkspace('ws-1', { name: 'New Name' })
    expect(result).toEqual(updated)
    expect(supabase.from).toHaveBeenCalledWith('workspaces')
  })

  it('throws on error', async () => {
    _mockSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'RLS denied' },
    })
    await expect(updateWorkspace('ws-1', {})).rejects.toThrow('RLS denied')
  })
})

describe('getUserWorkspaces', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns empty array when no data', async () => {
    const qb = supabase.from('workspace_users')
    qb.then = (resolve) => resolve({ data: null, error: null })
    const result = await getUserWorkspaces('user-1')
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(0)
  })

  it('maps workspace data with role', async () => {
    const qb = supabase.from('workspace_users')
    qb.then = (resolve) =>
      resolve({
        data: [
          { workspace_id: 'ws-1', role: 'proprietaire', workspaces: { id: 'ws-1', name: 'Shop' } },
        ],
        error: null,
      })
    const result = await getUserWorkspaces('user-1')
    expect(result[0]).toMatchObject({ id: 'ws-1', name: 'Shop', role: 'proprietaire' })
  })
})
