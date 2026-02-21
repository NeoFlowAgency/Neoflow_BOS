import { supabase, invokeFunction } from '../lib/supabase'

/**
 * Generate a URL-friendly slug from a name (with random suffix to avoid collisions)
 */
function generateSlug(name) {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 25)
    || 'workspace'
  const suffix = Math.random().toString(36).substring(2, 6)
  return `${base}-${suffix}`
}

/**
 * Check if Stripe is configured (publishable key set in env)
 */
export const isStripeEnabled = () => {
  const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  return !!key && key !== 'pk_test_xxxxx'
}

/**
 * Create a workspace with full legal info.
 * If Stripe is configured: subscription_status='incomplete', is_active=false (checkout required)
 * If Stripe is NOT configured: subscription_status='active', is_active=true (direct access)
 */
export const createWorkspace = async (name, userId, options = {}) => {
  const slug = generateSlug(name)
  const stripeEnabled = isStripeEnabled()

  const insertData = {
    name,
    slug,
    description: options.description || null,
    address: options.address || null,
    postal_code: options.postal_code || null,
    city: options.city || null,
    country: options.country || 'France',
    currency: options.currency || 'EUR',
    siret: options.siret || null,
    vat_number: options.vat_number || null,
    legal_form: options.legal_form || null,
    logo_url: options.logo_url || null,
    phone: options.phone || null,
    email: options.email || null,
    website: options.website || null,
    bank_iban: options.bank_iban || null,
    bank_bic: options.bank_bic || null,
    bank_account_holder: options.bank_account_holder || null,
    payment_terms: options.payment_terms || null,
    invoice_footer: options.invoice_footer || null,
    quote_footer: options.quote_footer || null,
    owner_user_id: userId,
    subscription_status: stripeEnabled ? 'incomplete' : 'active',
    is_active: !stripeEnabled,
  }

  // 1. Create workspace
  const { data: workspace, error: wsError } = await supabase
    .from('workspaces')
    .insert(insertData)
    .select()
    .single()

  if (wsError) {
    console.error('[createWorkspace] Erreur création workspace:', wsError)
    // User-friendly error messages
    if (wsError.code === '23505') {
      throw new Error('Ce nom de workspace est déjà utilisé. Veuillez en choisir un autre.')
    }
    if (wsError.code === '23503') {
      throw new Error('Erreur de référence. Veuillez réessayer.')
    }
    if (wsError.message?.includes('row-level security')) {
      throw new Error('Vous n\'avez pas la permission de créer un workspace. Veuillez vous reconnecter.')
    }
    throw new Error('Impossible de créer le workspace. Veuillez réessayer.')
  }

  // 2. Add user as owner
  const { error: userError } = await supabase
    .from('workspace_users')
    .insert({
      workspace_id: workspace.id,
      user_id: userId,
      role: 'proprietaire'
    })

  if (userError && userError.code !== '23505') {
    console.error('[createWorkspace] Erreur ajout utilisateur:', userError)
    throw new Error('Workspace créé mais impossible de vous y ajouter: ' + userError.message)
  }

  return workspace
}

/**
 * Create a Stripe Checkout session for a workspace
 */
export const createCheckoutSession = async (workspaceId, successUrl, cancelUrl, plan) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Non authentifié')

  return await invokeFunction('create-checkout', {
    workspace_id: workspaceId,
    success_url: successUrl || undefined,
    cancel_url: cancelUrl || undefined,
    plan: plan || undefined,
  })
}

/**
 * Create a Stripe Customer Portal session
 */
export const createPortalSession = async (workspaceId, returnUrl) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Non authentifié')

  return await invokeFunction('create-portal-session', {
    workspace_id: workspaceId,
    return_url: returnUrl || undefined,
  })
}

/**
 * Update workspace info (owner/manager only)
 */
export const updateWorkspace = async (workspaceId, updates) => {
  const { data, error } = await supabase
    .from('workspaces')
    .update(updates)
    .eq('id', workspaceId)
    .select()
    .single()

  if (error) throw new Error('Erreur mise à jour workspace: ' + error.message)
  return data
}

export const getUserWorkspaces = async (userId) => {
  const { data, error } = await supabase
    .from('workspace_users')
    .select('workspace_id, role, workspaces(*)')
    .eq('user_id', userId)

  if (error) {
    console.error('[getUserWorkspaces] Erreur:', error)
    throw error
  }

  return (data || []).map(wu => ({
    ...wu.workspaces,
    role: wu.role
  }))
}
