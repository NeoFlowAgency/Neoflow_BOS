import { supabase } from '../lib/supabase'

/**
 * Liste les articles de documentation publies, groupes par categorie
 */
export async function listArticles() {
  const { data, error } = await supabase
    .from('documentation_articles')
    .select('id, title, slug, category, position')
    .eq('is_published', true)
    .order('category', { ascending: true })
    .order('position', { ascending: true })

  if (error) throw new Error('Erreur chargement documentation: ' + error.message)
  return data || []
}

/**
 * Charge un article par son slug
 */
export async function getArticleBySlug(slug) {
  const { data, error } = await supabase
    .from('documentation_articles')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .single()

  if (error) throw new Error('Article introuvable')
  return data
}

/**
 * Charge un article par son ID
 */
export async function getArticle(articleId) {
  const { data, error } = await supabase
    .from('documentation_articles')
    .select('*')
    .eq('id', articleId)
    .single()

  if (error) throw new Error('Article introuvable')
  return data
}

/**
 * Recherche dans les articles (titre et contenu)
 */
export async function searchArticles(query) {
  const { data, error } = await supabase
    .from('documentation_articles')
    .select('id, title, slug, category, content')
    .eq('is_published', true)
    .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
    .order('position', { ascending: true })

  if (error) throw new Error('Erreur recherche: ' + error.message)
  return data || []
}

/**
 * Liste toutes les categories distinctes
 */
export async function listCategories() {
  const { data, error } = await supabase
    .from('documentation_articles')
    .select('category')
    .eq('is_published', true)

  if (error) throw new Error('Erreur chargement categories: ' + error.message)

  const categories = [...new Set((data || []).map(a => a.category))]
  return categories.sort()
}

// ============================================================
// ADMIN (proprietaire uniquement - utilise service_role ou RPC)
// ============================================================

/**
 * Liste tous les articles (publies et brouillons) pour l'admin
 */
export async function listAllArticles() {
  const { data, error } = await supabase
    .from('documentation_articles')
    .select('*')
    .order('category', { ascending: true })
    .order('position', { ascending: true })

  if (error) throw new Error('Erreur chargement articles: ' + error.message)
  return data || []
}

/**
 * Cree un article de documentation
 * Note: necessite un acces service_role ou une policy specifique
 */
export async function createArticle(articleData) {
  const { data, error } = await supabase
    .from('documentation_articles')
    .insert({
      title: articleData.title,
      slug: articleData.slug,
      content: articleData.content,
      category: articleData.category || 'general',
      position: articleData.position || 0,
      is_published: articleData.is_published !== false
    })
    .select()
    .single()

  if (error) throw new Error('Erreur creation article: ' + error.message)
  return data
}

/**
 * Met a jour un article
 */
export async function updateArticle(articleId, updates) {
  const { data, error } = await supabase
    .from('documentation_articles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', articleId)
    .select()
    .single()

  if (error) throw new Error('Erreur mise a jour article: ' + error.message)
  return data
}

/**
 * Supprime un article
 */
export async function deleteArticle(articleId) {
  const { error } = await supabase
    .from('documentation_articles')
    .delete()
    .eq('id', articleId)

  if (error) throw new Error('Erreur suppression article: ' + error.message)
}
