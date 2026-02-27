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

// Acces aux pages par role
export const PAGE_ACCESS = {
  '/dashboard':             ['proprietaire', 'manager', 'vendeur', 'livreur'],
  '/vente-rapide':          ['proprietaire', 'manager', 'vendeur'],
  '/commandes':             ['proprietaire', 'manager', 'vendeur'],
  '/commandes/nouvelle':    ['proprietaire', 'manager', 'vendeur'],
  '/factures':              ['proprietaire', 'manager', 'vendeur'],
  '/factures/nouvelle':     ['proprietaire', 'manager', 'vendeur'],
  '/devis':                 ['proprietaire', 'manager', 'vendeur'],
  '/devis/nouveau':         ['proprietaire', 'manager', 'vendeur'],
  '/clients':               ['proprietaire', 'manager', 'vendeur'],
  '/produits':              ['proprietaire', 'manager', 'vendeur', 'livreur'],
  '/stock':                 ['proprietaire', 'manager', 'vendeur', 'livreur'],
  '/stock/emplacements':    ['proprietaire', 'manager'],
  '/fournisseurs':          ['proprietaire', 'manager'],
  '/livraisons':            ['proprietaire', 'manager', 'vendeur', 'livreur'],
  '/statistiques':          ['proprietaire', 'manager'],
  '/documentation':         ['proprietaire', 'manager', 'vendeur', 'livreur'],
  '/settings':              ['proprietaire', 'manager', 'vendeur', 'livreur'],
}

// Roles par fonctionnalite
const SALES_ROLES = ['proprietaire', 'manager', 'vendeur']
const MANAGEMENT_ROLES = ['proprietaire', 'manager']
const ALL_ROLES = ['proprietaire', 'manager', 'vendeur', 'livreur']

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

/**
 * Verifie si le role peut creer des ventes (commandes, factures, devis)
 */
export function canCreateSales(role) {
  return SALES_ROLES.includes(role)
}

/**
 * Verifie si le role peut gerer le stock (ajustements, emplacements)
 */
export function canManageStock(role) {
  return MANAGEMENT_ROLES.includes(role)
}

/**
 * Verifie si le role peut voir le stock (lecture seule)
 */
export function canViewStock(role) {
  return ALL_ROLES.includes(role)
}

/**
 * Verifie si le role peut gerer les fournisseurs et bons de commande
 */
export function canManageSuppliers(role) {
  return MANAGEMENT_ROLES.includes(role)
}

/**
 * Verifie si le role peut enregistrer un paiement
 * Livreur peut enregistrer un paiement a la livraison uniquement
 */
export function canRecordPayment(role) {
  return ALL_ROLES.includes(role)
}

/**
 * Verifie si le role peut voir les marges et couts d'achat
 */
export function canViewMargins(role) {
  return MANAGEMENT_ROLES.includes(role)
}

/**
 * Verifie si le role peut acceder aux statistiques completes
 */
export function canViewStatistics(role) {
  return MANAGEMENT_ROLES.includes(role)
}

/**
 * Verifie l'acces a une page donnee
 */
export function canAccessPage(role, path) {
  const normalizedPath = path.replace(/\/[a-f0-9-]{36}/g, '/:id')
  const allowedRoles = PAGE_ACCESS[normalizedPath] || PAGE_ACCESS[path]
  if (!allowedRoles) return true
  return allowedRoles.includes(role)
}
