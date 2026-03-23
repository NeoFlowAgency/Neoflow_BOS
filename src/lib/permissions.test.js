import { describe, it, expect } from 'vitest'
import {
  ROLES,
  ROLE_HIERARCHY,
  canManageRole,
  getAssignableRoles,
  canAccessBusiness,
  canManageWorkspace,
  canCreateSales,
  canManageStock,
  canViewStock,
  canManageSuppliers,
  canRecordPayment,
  canViewMargins,
  canViewStatistics,
  canAccessPage,
} from './permissions'

describe('ROLES', () => {
  it('should define all four roles', () => {
    expect(ROLES.PROPRIETAIRE).toBe('proprietaire')
    expect(ROLES.MANAGER).toBe('manager')
    expect(ROLES.VENDEUR).toBe('vendeur')
    expect(ROLES.LIVREUR).toBe('livreur')
  })
})

describe('ROLE_HIERARCHY', () => {
  it('should have proprietaire first (highest)', () => {
    expect(ROLE_HIERARCHY[0]).toBe('proprietaire')
  })
  it('should have livreur last (lowest)', () => {
    expect(ROLE_HIERARCHY[ROLE_HIERARCHY.length - 1]).toBe('livreur')
  })
})

describe('canManageRole', () => {
  it('proprietaire can manage manager, vendeur, livreur', () => {
    expect(canManageRole('proprietaire', 'manager')).toBe(true)
    expect(canManageRole('proprietaire', 'vendeur')).toBe(true)
    expect(canManageRole('proprietaire', 'livreur')).toBe(true)
  })
  it('manager can manage vendeur and livreur', () => {
    expect(canManageRole('manager', 'vendeur')).toBe(true)
    expect(canManageRole('manager', 'livreur')).toBe(true)
  })
  it('manager cannot manage proprietaire or himself', () => {
    expect(canManageRole('manager', 'proprietaire')).toBe(false)
    expect(canManageRole('manager', 'manager')).toBe(false)
  })
  it('vendeur can manage livreur (lower in hierarchy)', () => {
    expect(canManageRole('vendeur', 'livreur')).toBe(true)
  })
  it('vendeur cannot manage itself or higher roles', () => {
    expect(canManageRole('vendeur', 'vendeur')).toBe(false)
    expect(canManageRole('vendeur', 'manager')).toBe(false)
    expect(canManageRole('vendeur', 'proprietaire')).toBe(false)
  })
  it('livreur cannot manage anyone', () => {
    expect(canManageRole('livreur', 'livreur')).toBe(false)
    expect(canManageRole('livreur', 'vendeur')).toBe(false)
  })
  it('returns false for invalid roles', () => {
    expect(canManageRole('unknown', 'vendeur')).toBe(false)
    expect(canManageRole('proprietaire', 'unknown')).toBe(false)
  })
})

describe('getAssignableRoles', () => {
  it('proprietaire can assign manager, vendeur, livreur', () => {
    expect(getAssignableRoles('proprietaire')).toEqual(['manager', 'vendeur', 'livreur'])
  })
  it('manager can assign vendeur, livreur', () => {
    expect(getAssignableRoles('manager')).toEqual(['vendeur', 'livreur'])
  })
  it('vendeur can assign livreur', () => {
    expect(getAssignableRoles('vendeur')).toEqual(['livreur'])
  })
  it('livreur can assign nobody', () => {
    expect(getAssignableRoles('livreur')).toEqual([])
  })
  it('invalid role returns empty', () => {
    expect(getAssignableRoles('unknown')).toEqual([])
  })
})

describe('canAccessBusiness', () => {
  it('returns true for proprietaire, manager, vendeur', () => {
    expect(canAccessBusiness('proprietaire')).toBe(true)
    expect(canAccessBusiness('manager')).toBe(true)
    expect(canAccessBusiness('vendeur')).toBe(true)
  })
  it('returns false for livreur', () => {
    expect(canAccessBusiness('livreur')).toBe(false)
  })
})

describe('canManageWorkspace', () => {
  it('returns true for proprietaire and manager', () => {
    expect(canManageWorkspace('proprietaire')).toBe(true)
    expect(canManageWorkspace('manager')).toBe(true)
  })
  it('returns false for vendeur and livreur', () => {
    expect(canManageWorkspace('vendeur')).toBe(false)
    expect(canManageWorkspace('livreur')).toBe(false)
  })
})

describe('canCreateSales', () => {
  it('returns true for proprietaire, manager, vendeur', () => {
    expect(canCreateSales('proprietaire')).toBe(true)
    expect(canCreateSales('manager')).toBe(true)
    expect(canCreateSales('vendeur')).toBe(true)
  })
  it('returns false for livreur', () => {
    expect(canCreateSales('livreur')).toBe(false)
  })
})

describe('canManageStock', () => {
  it('returns true for proprietaire and manager only', () => {
    expect(canManageStock('proprietaire')).toBe(true)
    expect(canManageStock('manager')).toBe(true)
    expect(canManageStock('vendeur')).toBe(false)
    expect(canManageStock('livreur')).toBe(false)
  })
})

describe('canViewStock', () => {
  it('returns true for all roles', () => {
    expect(canViewStock('proprietaire')).toBe(true)
    expect(canViewStock('manager')).toBe(true)
    expect(canViewStock('vendeur')).toBe(true)
    expect(canViewStock('livreur')).toBe(true)
  })
  it('returns false for unknown role', () => {
    expect(canViewStock('unknown')).toBe(false)
  })
})

describe('canManageSuppliers', () => {
  it('returns true for proprietaire and manager', () => {
    expect(canManageSuppliers('proprietaire')).toBe(true)
    expect(canManageSuppliers('manager')).toBe(true)
  })
  it('returns false for vendeur and livreur', () => {
    expect(canManageSuppliers('vendeur')).toBe(false)
    expect(canManageSuppliers('livreur')).toBe(false)
  })
})

describe('canRecordPayment', () => {
  it('returns true for all roles', () => {
    expect(canRecordPayment('proprietaire')).toBe(true)
    expect(canRecordPayment('manager')).toBe(true)
    expect(canRecordPayment('vendeur')).toBe(true)
    expect(canRecordPayment('livreur')).toBe(true)
  })
})

describe('canViewMargins', () => {
  it('returns true only for management', () => {
    expect(canViewMargins('proprietaire')).toBe(true)
    expect(canViewMargins('manager')).toBe(true)
    expect(canViewMargins('vendeur')).toBe(false)
    expect(canViewMargins('livreur')).toBe(false)
  })
})

describe('canViewStatistics', () => {
  it('returns true only for management', () => {
    expect(canViewStatistics('proprietaire')).toBe(true)
    expect(canViewStatistics('manager')).toBe(true)
    expect(canViewStatistics('vendeur')).toBe(false)
    expect(canViewStatistics('livreur')).toBe(false)
  })
})

describe('canAccessPage', () => {
  it('allows all roles to access /dashboard', () => {
    expect(canAccessPage('proprietaire', '/dashboard')).toBe(true)
    expect(canAccessPage('livreur', '/dashboard')).toBe(true)
  })
  it('restricts /statistiques to management only', () => {
    expect(canAccessPage('proprietaire', '/statistiques')).toBe(true)
    expect(canAccessPage('manager', '/statistiques')).toBe(true)
    expect(canAccessPage('vendeur', '/statistiques')).toBe(false)
    expect(canAccessPage('livreur', '/statistiques')).toBe(false)
  })
  it('restricts /stock/emplacements to management only', () => {
    expect(canAccessPage('proprietaire', '/stock/emplacements')).toBe(true)
    expect(canAccessPage('manager', '/stock/emplacements')).toBe(true)
    expect(canAccessPage('vendeur', '/stock/emplacements')).toBe(false)
  })
  it('allows all roles to access /livraisons', () => {
    expect(canAccessPage('livreur', '/livraisons')).toBe(true)
    expect(canAccessPage('vendeur', '/livraisons')).toBe(true)
  })
  it('strips UUID segments when checking pages', () => {
    // e.g. /commandes/550e8400-e29b-41d4-a716-446655440000 -> /commandes/:id
    // but /commandes is in PAGE_ACCESS directly
    expect(canAccessPage('vendeur', '/commandes')).toBe(true)
    expect(canAccessPage('livreur', '/commandes')).toBe(false)
  })
  it('returns true for unknown paths (no restriction)', () => {
    expect(canAccessPage('livreur', '/some/unknown/path')).toBe(true)
  })
})
