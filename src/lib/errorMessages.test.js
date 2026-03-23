import { describe, it, expect } from 'vitest'
import { translateError } from './errorMessages'

describe('translateError', () => {
  it('translates "Invalid login credentials"', () => {
    expect(translateError('Invalid login credentials')).toBe('Email ou mot de passe incorrect')
  })

  it('translates "Email not confirmed"', () => {
    expect(translateError('Email not confirmed')).toMatch(/email/)
  })

  it('translates "User already registered"', () => {
    expect(translateError('User already registered')).toMatch(/compte/)
  })

  it('translates "Password should be at least"', () => {
    expect(translateError('Password should be at least 8 characters')).toMatch(/mot de passe/)
  })

  it('translates rate limit error', () => {
    expect(translateError('rate limit exceeded')).toMatch(/tentatives/)
  })

  it('translates JWT expired', () => {
    expect(translateError('JWT expired')).toMatch(/session/)
  })

  it('translates RLS violation', () => {
    expect(translateError('new row violates row-level security')).toMatch(/droits/)
  })

  it('translates duplicate key', () => {
    expect(translateError('duplicate key value')).toMatch(/existe déjà/)
  })

  it('translates Failed to fetch', () => {
    expect(translateError('Failed to fetch')).toMatch(/serveur/)
  })

  it('translates NetworkError', () => {
    expect(translateError('NetworkError when attempting to fetch')).toMatch(/réseau/)
  })

  it('translates same_password', () => {
    expect(translateError('same_password')).toMatch(/différent/)
  })

  it('accepts an Error object', () => {
    const err = new Error('Invalid login credentials')
    expect(translateError(err)).toBe('Email ou mot de passe incorrect')
  })

  it('accepts an object with message property', () => {
    expect(translateError({ message: 'JWT expired' })).toMatch(/session/)
  })

  it('is case-insensitive', () => {
    expect(translateError('INVALID LOGIN CREDENTIALS')).toBe('Email ou mot de passe incorrect')
  })

  it('returns fallback for unknown error', () => {
    expect(translateError('some totally unknown error xyz')).toBe('Une erreur est survenue. Veuillez réessayer.')
  })

  it('returns fallback for empty string', () => {
    expect(translateError('')).toBe('Une erreur est survenue. Veuillez réessayer.')
  })

  it('returns fallback for null', () => {
    expect(translateError(null)).toBe('Une erreur est survenue. Veuillez réessayer.')
  })

  it('returns fallback for undefined', () => {
    expect(translateError(undefined)).toBe('Une erreur est survenue. Veuillez réessayer.')
  })

  it('translates Stripe configuration error', () => {
    expect(translateError('Stripe configuration missing')).toMatch(/Stripe/)
  })

  it('translates invitation expiry', () => {
    expect(translateError("invitation a expire il y a longtemps")).toMatch(/expir/)
  })
})
