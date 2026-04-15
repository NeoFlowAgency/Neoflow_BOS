import { supabase } from '../lib/supabase'

/**
 * Liste les variantes d'un produit (non archivées)
 */
export async function listVariants(productId) {
  const { data, error } = await supabase
    .from('product_variants')
    .select('*')
    .eq('product_id', productId)
    .eq('is_archived', false)
    .order('size')
    .order('comfort')
  if (error) throw new Error('Erreur chargement variantes: ' + error.message)
  return data || []
}

/**
 * Liste toutes les variantes d'un workspace (pour la vente rapide)
 */
export async function listVariantsByWorkspace(workspaceId) {
  const { data, error } = await supabase
    .from('product_variants')
    .select('*, product:products(name, reference, category)')
    .eq('workspace_id', workspaceId)
    .eq('is_archived', false)
    .order('size')
  if (error) throw new Error('Erreur chargement variantes: ' + error.message)
  return data || []
}

/**
 * Crée une variante pour un produit
 */
export async function createVariant(workspaceId, productId, variantData) {
  const { data, error } = await supabase
    .from('product_variants')
    .insert({
      workspace_id: workspaceId,
      product_id: productId,
      size: variantData.size,
      comfort: variantData.comfort || null,
      price: variantData.price || 0,
      purchase_price: variantData.purchase_price || 0,
      sku_supplier: variantData.sku_supplier || null,
    })
    .select()
    .single()
  if (error) throw new Error('Erreur création variante: ' + error.message)
  return data
}

/**
 * Met à jour une variante
 */
export async function updateVariant(variantId, updates) {
  const { data, error } = await supabase
    .from('product_variants')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', variantId)
    .select()
    .single()
  if (error) throw new Error('Erreur mise à jour variante: ' + error.message)
  return data
}

/**
 * Archive une variante (soft delete)
 */
export async function archiveVariant(variantId) {
  const { error } = await supabase
    .from('product_variants')
    .update({ is_archived: true, updated_at: new Date().toISOString() })
    .eq('id', variantId)
  if (error) throw new Error('Erreur suppression variante: ' + error.message)
}
