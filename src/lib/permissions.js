export const ROLES = {
  PROPRIETAIRE: 'proprietaire',
  MANAGER: 'manager',
  VENDEUR: 'vendeur',
  LIVREUR: 'livreur',
}

export const ROLE_LABELS = {
  proprietaire: 'Proprietaire',
  manager: 'Manager',
  vendeur: 'Vendeur',
  livreur: 'Livreur',
}

export const ROLE_COLORS = {
  proprietaire: 'bg-purple-100 text-purple-700',
  manager: 'bg-blue-100 text-blue-700',
  vendeur: 'bg-green-100 text-green-700',
  livreur: 'bg-orange-100 text-orange-700',
}

// Ordre hierarchique (index 0 = plus haut)
export const ROLE_HIERARCHY = ['proprietaire', 'manager', 'vendeur', 'livreur']

/**
 * Verifie si myRole peut gerer targetRole (hierarchie stricte)
 */
export function canManageRole(myRole, targetRole) {
  const myIndex = ROLE_HIERARCHY.indexOf(myRole)
  const targetIndex = ROLE_HIERARCHY.indexOf(targetRole)
  return myIndex >= 0 && targetIndex >= 0 && myIndex < targetIndex
}

/**
 * Retourne les roles qu'on peut attribuer (tous ceux en dessous dans la hierarchie)
 */
export function getAssignableRoles(myRole) {
  const myIndex = ROLE_HIERARCHY.indexOf(myRole)
  if (myIndex < 0) return []
  return ROLE_HIERARCHY.slice(myIndex + 1)
}

/**
 * Verifie si le role a acces aux fonctionnalites business (factures, devis, clients, produits, stats)
 */
export function canAccessBusiness(role) {
  return role !== ROLES.LIVREUR
}

/**
 * Verifie si le role peut gerer le workspace (edit infos, invitations)
 */
export function canManageWorkspace(role) {
  return role === ROLES.PROPRIETAIRE || role === ROLES.MANAGER
}
