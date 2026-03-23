import { vi } from 'vitest'

// Chainable query builder mock
function createQueryBuilder(defaultData = null, defaultError = null) {
  const builder = {
    _data: defaultData,
    _error: defaultError,
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: defaultData, error: defaultError }),
    maybeSingle: vi.fn().mockResolvedValue({ data: defaultData, error: defaultError }),
    then: (resolve) => resolve({ data: defaultData, error: defaultError }),
  }
  // Make it thenable (Promise-like) for await
  Object.defineProperty(builder, Symbol.toStringTag, { value: 'Promise' })
  return builder
}

export const mockQueryBuilder = createQueryBuilder()

export const supabase = {
  from: vi.fn(() => mockQueryBuilder),
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-123', email: 'test@test.com' } }, error: null }),
    getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } }, error: null }),
    signInWithPassword: vi.fn().mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null }),
    signUp: vi.fn().mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
    updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
  },
  storage: {
    from: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: { path: 'test/path' }, error: null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://test.url/file.jpg' } }),
      remove: vi.fn().mockResolvedValue({ error: null }),
    }),
  },
  functions: {
    invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
  channel: vi.fn().mockReturnValue({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn(),
  }),
  removeChannel: vi.fn(),
}

export const invokeFunction = vi.fn().mockResolvedValue({ data: null, error: null })
