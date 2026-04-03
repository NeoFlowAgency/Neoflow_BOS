export const ROLES = {
  PROPRIETAIRE: 'proprietaire',
  MANAGER: 'manager',
  VENDEUR: 'vendeur',
  LIVREUR: 'livreur',
}

export const ROLE_LABELS = {
  proprietaire: 'Propriétaire',
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

// ============================================================
// PLAN-BASED PERMISSIONS
// plan : 'basic' | 'pro' | 'enterprise' | 'early-access'
// ============================================================

const PRO_PLANS = ['pro', 'enterprise', 'early-access']
const ENTERPRISE_PLANS = ['enterprise']

/**
 * Neo AI disponible sur tous les plans (avec limite de crédits sur basic/pro)
 * Retourne false seulement si pas d'abonnement actif
 */
export function canUseNeo(plan) {
  return ['basic', 'pro', 'enterprise', 'early-access'].includes(plan)
}

/**
 * Agent IA (Neo avec function calling) — Pro et Enterprise uniquement
 */
export function canUseNeoAgent(plan) {
  return PRO_PLANS.includes(plan)
}

/**
 * SAV disponible sur tous les plans (basic = basique, pro/enterprise = complet)
 */
export function canUseSAV(plan) {
  return ['basic', 'pro', 'enterprise', 'early-access'].includes(plan)
}

/**
 * SAV avancé (garantie multi-intervenant, reporting SAV) — Pro/Enterprise
 */
export function canUseAdvancedSAV(plan) {
  return PRO_PLANS.includes(plan)
}

/**
 * App livreur mobile-first + tracking GPS — Pro/Enterprise uniquement
 */
export function canUseDeliveryApp(plan) {
  return PRO_PLANS.includes(plan)
}

/**
 * Gestion multi-workspace avancée — Enterprise uniquement
 */
export function canUseMultiWorkspace(plan) {
  return ENTERPRISE_PLANS.includes(plan)
}

/**
 * Nombre maximum de membres selon le plan
 * -1 = illimité
 */
export function getMaxMembers(plan) {
  if (ENTERPRISE_PLANS.includes(plan)) return -1
  if (PRO_PLANS.includes(plan)) return 10
  return 2 // basic
}

/**
 * Allocation mensuelle NeoCredits selon le plan
 * -1 = illimité (enterprise)
 */
export function getMonthlyNeoCredits(plan) {
  if (ENTERPRISE_PLANS.includes(plan)) return -1
  if (PRO_PLANS.includes(plan)) return 2000
  return 200 // basic
}

/**
 * Label et couleur du plan pour l'affichage
 */
export const PLAN_LABELS = {
  basic: { label: 'Basic', color: 'bg-gray-100 text-gray-700', accent: '#6B7280' },
  pro: { label: 'Pro', color: 'bg-blue-100 text-blue-700', accent: '#313ADF' },
  enterprise: { label: 'Enterprise', color: 'bg-purple-100 text-purple-700', accent: '#7C3AED' },
  'early-access': { label: 'Accès Anticipé', color: 'bg-amber-100 text-amber-700', accent: '#D97706' },
}
