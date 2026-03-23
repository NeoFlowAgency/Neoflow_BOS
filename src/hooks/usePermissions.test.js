import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// Mock WorkspaceContext
const mockCurrentWorkspace = { id: 'ws-1', name: 'Test WS' }
vi.mock('../contexts/WorkspaceContext', () => ({
  useWorkspace: vi.fn(() => ({ currentWorkspace: mockCurrentWorkspace })),
}))

// Mock supabase
const { mockGetUser, mockFrom } = vi.hoisted(() => {
  const mockGetUser = vi.fn()
  const mockSingle = vi.fn()
  const mockEq = vi.fn().mockReturnThis()
  const mockSelect = vi.fn().mockReturnThis()
  const qb = { select: mockSelect, eq: mockEq, single: mockSingle }
  const mockFrom = vi.fn(() => qb)
  return { mockGetUser, mockFrom, mockSingle, mockEq, mockSelect }
})

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: mockGetUser },
    from: mockFrom,
  },
}))

import { usePermissions } from './usePermissions'
import { useWorkspace } from '../contexts/WorkspaceContext'

// Re-import hoisted single mock for setup
const { mockSingle } = vi.hoisted ? (() => {
  // already declared above, just return it
  return {}
})() : {}

describe('usePermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWorkspace.mockReturnValue({ currentWorkspace: mockCurrentWorkspace })
  })

  it('starts with loading=true and role=null', () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    // Don't resolve the from().single() yet
    const single = vi.fn(() => new Promise(() => {}))
    mockFrom.mockReturnValue({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single })

    const { result } = renderHook(() => usePermissions())
    expect(result.current.loading).toBe(true)
    expect(result.current.role).toBe(null)
  })

  it('sets role after loading', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const single = vi.fn().mockResolvedValue({ data: { role: 'proprietaire' }, error: null })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single,
    })

    const { result } = renderHook(() => usePermissions())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.role).toBe('proprietaire')
  })

  it('sets role=null when no user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const { result } = renderHook(() => usePermissions())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.role).toBe(null)
  })

  it('sets role=null when no workspace', async () => {
    useWorkspace.mockReturnValue({ currentWorkspace: null })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    const { result } = renderHook(() => usePermissions())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.role).toBe(null)
  })

  it('sets role=null on supabase error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const single = vi.fn().mockRejectedValue(new Error('DB error'))
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single,
    })

    const { result } = renderHook(() => usePermissions())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.role).toBe(null)
  })
})
