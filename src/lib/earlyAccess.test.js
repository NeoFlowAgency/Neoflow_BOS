import { describe, it, expect } from 'vitest'
import { isAdminUser } from './earlyAccess'

describe('isAdminUser', () => {
  it('returns true for a user object with is_internal_admin = true', () => {
    const user = { app_metadata: { is_internal_admin: true } }
    expect(isAdminUser(user)).toBe(true)
  })

  it('returns false for a user object without is_internal_admin', () => {
    expect(isAdminUser({ app_metadata: {} })).toBe(false)
    expect(isAdminUser({ app_metadata: { is_internal_admin: false } })).toBe(false)
    expect(isAdminUser({})).toBe(false)
  })

  it('returns false for an email string (legacy, no longer supported)', () => {
    expect(isAdminUser('neoflowagency05@gmail.com')).toBe(false)
    expect(isAdminUser('admin@test.com')).toBe(false)
  })

  it('returns false for null and undefined', () => {
    expect(isAdminUser(null)).toBe(false)
    expect(isAdminUser(undefined)).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isAdminUser('')).toBe(false)
  })

  it('returns false for 0 or false', () => {
    expect(isAdminUser(false)).toBe(false)
    expect(isAdminUser(0)).toBe(false)
  })
})
