import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useWorkspace } from '../contexts/WorkspaceContext'
import {
  listAllArticles,
  createArticle,
  updateArticle,
  deleteArticle
} from '../services/documentationService'

const CATEGORIES = [
  { key: 'prise-en-main', label: 'Prise en main' },
  { key: 'ventes',         label: 'Ventes' },
  { key: 'stock',          label: 'Stock' },
  { key: 'fournisseurs',   label: 'Fournisseurs' },
  { key: 'livraisons',     label: 'Livraisons' },
  { key: 'statistiques',   label: 'Statistiques' },
  { key: 'faq',            label: 'FAQ' },
]

// ─── Simple markdown preview ─────────────────────────────────────────────────

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function inlineMd(str) {
  return str
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono text-[#313ADF]">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-[#040741]">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em class="italic">$1</em>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-[#313ADF] underline" target="_blank" rel="noopener noreferrer">$1</a>')
}

function renderMarkdown(text) {
  if (!text) return { __html: '<p class="text-gray-400 italic">Aucun contenu...</p>' }
  const lines = text.split('\n')
  const html = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('```')) {
      const codeLines = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(escHtml(lines[i]))
        i++
      }
      html.push(`<pre class="bg-gray-900 text-green-300 rounded-xl p-4 text-sm font-mono my-4 leading-relaxed overflow-x-auto"><code>${codeLines.join('\n')}</code></pre>`)
      i++
      continue
    }

    if (line.startsWith('### ')) {
      html.push(`<h3 class="text-base font-bold text-[#040741] mt-6 mb-2">${inlineMd(escHtml(line.slice(4)))}</h3>`)
    } else if (line.startsWith('## ')) {
      html.push(`<h2 class="text-xl font-bold text-[#040741] mt-8 mb-3 pb-2 border-b border-gray-200">${inlineMd(escHtml(line.slice(3)))}</h2>`)
    } else if (line.startsWith('# ')) {
      html.push(`<h1 class="text-2xl font-bold text-[#040741] mb-4">${inlineMd(escHtml(line.slice(2)))}</h1>`)
    } else if (line.trim() === '---') {
      html.push('<hr class="border-gray-200 my-6" />')
    } else if (line.startsWith('> ')) {
      html.push(`<blockquote class="border-l-4 border-[#313ADF] pl-4 bg-blue-50 py-2 pr-4 rounded-r-xl my-3 text-gray-600 italic">${inlineMd(escHtml(line.slice(2)))}</blockquote>`)
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      const items = []
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        items.push(`<li class="flex items-start gap-2 text-gray-700"><span class="text-[#313ADF] font-bold mt-0.5 flex-shrink-0">•</span><span>${inlineMd(escHtml(lines[i].slice(2)))}</span></li>`)
        i++
      }
      html.push(`<ul class="space-y-1.5 my-4 ml-1">${items.join('')}</ul>`)
      continue
    } else if (/^\d+\. /.test(line)) {
      const items = []
      let num = 1
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(`<li class="flex items-start gap-2 text-gray-700"><span class="text-[#313ADF] font-bold w-5 flex-shrink-0">${num}.</span><span>${inlineMd(escHtml(lines[i].replace(/^\d+\. /, '')))}</span></li>`)
        i++
        num++
      }
      html.push(`<ol class="space-y-1.5 my-4 ml-1">${items.join('')}</ol>`)
      continue
    } else if (line.trim() === '') {
      html.push('<div class="h-2"></div>')
    } else {
      html.push(`<p class="text-gray-700 leading-relaxed mb-3">${inlineMd(escHtml(line))}</p>`)
    }

    i++
  }

  return { __html: html.join('') }
}

// ─── Slug generator ─────────────────────────────────────────────────────────

function slugify(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

// ────────────────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  title: '',
  slug: '',
  category: 'prise-en-main',
  position: 0,
  is_published: true,
  content: ''
}

export default function DocumentationAdmin() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { role } = useWorkspace()

  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [activeTab, setActiveTab] = useState('edit') // 'edit' | 'preview'
  const [slugManual, setSlugManual] = useState(false)

  const [confirmDelete, setConfirmDelete] = useState(null)
  const [filterCat, setFilterCat] = useState('all')

  // Redirect if not proprietaire
  useEffect(() => {
    if (role && role !== 'proprietaire') {
      navigate('/documentation')
    }
  }, [role, navigate])

  useEffect(() => {
    loadArticles()
  }, [])

  // Auto-open edit modal if ?edit=id in URL
  useEffect(() => {
    const editId = searchParams.get('edit')
    if (editId && articles.length > 0) {
      const article = articles.find(a => a.id === editId)
      if (article) openEdit(article)
    }
  }, [searchParams, articles])

  const loadArticles = async () => {
    try {
      const data = await listAllArticles()
      setArticles(data)
    } catch {
      setError('Erreur chargement articles')
    } finally {
      setLoading(false)
    }
  }

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setSlugManual(false)
    setActiveTab('edit')
    setError('')
    setModalOpen(true)
  }

  const openEdit = (article) => {
    setEditingId(article.id)
    setForm({
      title: article.title || '',
      slug: article.slug || '',
      category: article.category || 'prise-en-main',
      position: article.position || 0,
      is_published: article.is_published !== false,
      content: article.content || ''
    })
    setSlugManual(true)
    setActiveTab('edit')
    setError('')
    setModalOpen(true)
  }

  const handleTitleChange = (value) => {
    setForm(prev => ({
      ...prev,
      title: value,
      ...(!slugManual ? { slug: slugify(value) } : {})
    }))
  }

  const handleSlugChange = (value) => {
    setSlugManual(true)
    setForm(prev => ({ ...prev, slug: value }))
  }

  const handleSave = async () => {
    setError('')
    if (!form.title.trim()) { setError('Le titre est requis'); return }
    if (!form.slug.trim()) { setError('Le slug est requis'); return }
    if (!form.content.trim()) { setError('Le contenu est requis'); return }

    setSaving(true)
    try {
      if (editingId) {
        await updateArticle(editingId, form)
        setSuccess('Article mis a jour')
      } else {
        await createArticle(form)
        setSuccess('Article cree')
      }
      await loadArticles()
      setModalOpen(false)
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (articleId) => {
    setDeleting(articleId)
    try {
      await deleteArticle(articleId)
      setArticles(prev => prev.filter(a => a.id !== articleId))
      setConfirmDelete(null)
      setSuccess('Article supprime')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setDeleting(null)
    }
  }

  const togglePublished = async (article) => {
    try {
      await updateArticle(article.id, { is_published: !article.is_published })
      setArticles(prev => prev.map(a => a.id === article.id ? { ...a, is_published: !a.is_published } : a))
    } catch {
      setError('Erreur mise a jour statut')
    }
  }

  const filteredArticles = filterCat === 'all'
    ? articles
    : articles.filter(a => a.category === filterCat)

  const catLabel = (key) => CATEGORIES.find(c => c.key === key)?.label || key

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-[#313ADF] border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
            <button onClick={() => navigate('/documentation')} className="hover:text-[#313ADF] transition-colors">Documentation</button>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-gray-600 font-medium">Gestion</span>
          </div>
          <h1 className="text-2xl font-bold text-[#040741]">Gestion de la documentation</h1>
          <p className="text-gray-500 text-sm mt-1">{articles.length} article{articles.length !== 1 ? 's' : ''} au total</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/documentation')}
            className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-colors text-sm"
          >
            Voir la doc
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-[#313ADF] text-white rounded-xl font-medium hover:bg-[#4149e8] transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nouvel article
          </button>
        </div>
      </div>

      {/* Success / Error banners */}
      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {success}
        </div>
      )}

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap mb-6">
        <button
          onClick={() => setFilterCat('all')}
          className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${filterCat === 'all' ? 'bg-[#313ADF] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          Tous ({articles.length})
        </button>
        {CATEGORIES.map(cat => {
          const count = articles.filter(a => a.category === cat.key).length
          if (count === 0) return null
          return (
            <button
              key={cat.key}
              onClick={() => setFilterCat(cat.key)}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${filterCat === cat.key ? 'bg-[#313ADF] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {cat.label} ({count})
            </button>
          )
        })}
      </div>

      {/* Articles table */}
      {filteredArticles.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <p className="text-gray-500 mb-4">Aucun article. Creez le premier !</p>
          <button onClick={openCreate} className="px-5 py-2.5 bg-[#313ADF] text-white rounded-xl font-medium hover:bg-[#4149e8] transition-colors">
            Creer un article
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600">Titre</th>
                <th className="px-4 py-4 text-left text-sm font-semibold text-gray-600 hidden md:table-cell">Categorie</th>
                <th className="px-4 py-4 text-center text-sm font-semibold text-gray-600 hidden md:table-cell">Pos.</th>
                <th className="px-4 py-4 text-center text-sm font-semibold text-gray-600">Publie</th>
                <th className="px-4 py-4 text-right text-sm font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredArticles.map((article, idx) => (
                <tr key={article.id} className={`hover:bg-gray-50 transition-colors ${idx % 2 === 1 ? 'bg-gray-50/50' : ''}`}>
                  <td className="px-6 py-4">
                    <p className="font-medium text-[#040741] text-sm">{article.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5 font-mono">{article.slug}</p>
                  </td>
                  <td className="px-4 py-4 hidden md:table-cell">
                    <span className="px-2.5 py-1 bg-[#313ADF]/10 text-[#313ADF] rounded-lg text-xs font-medium">
                      {catLabel(article.category)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center hidden md:table-cell">
                    <span className="text-sm text-gray-500 font-mono">{article.position}</span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <button
                      onClick={() => togglePublished(article)}
                      className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 inline-flex ${article.is_published ? 'bg-green-500' : 'bg-gray-300'}`}
                    >
                      <span className={`w-4 h-4 bg-white rounded-full shadow absolute top-1 transition-transform ${article.is_published ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(article)}
                        className="p-1.5 text-gray-400 hover:text-[#313ADF] hover:bg-[#313ADF]/10 rounded-lg transition-colors"
                        title="Modifier"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setConfirmDelete(article)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Supprimer"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Edit / Create Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-[#040741]">
                {editingId ? 'Modifier l\'article' : 'Nouvel article'}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Error */}
            {error && (
              <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-gray-100 px-6">
              <button
                onClick={() => setActiveTab('edit')}
                className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'edit' ? 'border-[#313ADF] text-[#313ADF]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                Editeur
              </button>
              <button
                onClick={() => setActiveTab('preview')}
                className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'preview' ? 'border-[#313ADF] text-[#313ADF]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                Apercu
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {activeTab === 'edit' ? (
                <div className="p-6 space-y-4">
                  {/* Title + Category + Position row */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-semibold text-[#040741] mb-1">Titre *</label>
                      <input
                        type="text"
                        value={form.title}
                        onChange={e => handleTitleChange(e.target.value)}
                        placeholder="Titre de l'article..."
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#040741] mb-1">Categorie</label>
                      <select
                        value={form.category}
                        onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
                      >
                        {CATEGORIES.map(c => (
                          <option key={c.key} value={c.key}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Slug + Position + Published row */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-semibold text-[#040741] mb-1">Slug *</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-mono">/doc/</span>
                        <input
                          type="text"
                          value={form.slug}
                          onChange={e => handleSlugChange(e.target.value)}
                          placeholder="mon-article"
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-14 pr-4 py-2.5 text-[#040741] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
                        />
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="block text-sm font-semibold text-[#040741] mb-1">Position</label>
                        <input
                          type="number"
                          min={0}
                          value={form.position}
                          onChange={e => setForm(prev => ({ ...prev, position: parseInt(e.target.value) || 0 }))}
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-[#040741] mb-1">Publie</label>
                        <button
                          type="button"
                          onClick={() => setForm(prev => ({ ...prev, is_published: !prev.is_published }))}
                          className={`mt-0.5 w-12 h-7 rounded-full transition-colors relative flex-shrink-0 flex ${form.is_published ? 'bg-green-500' : 'bg-gray-300'}`}
                        >
                          <span className={`w-5 h-5 bg-white rounded-full shadow absolute top-1 transition-transform ${form.is_published ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Content textarea */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-semibold text-[#040741]">Contenu (Markdown) *</label>
                      <span className="text-xs text-gray-400">{form.content.length} caracteres</span>
                    </div>
                    <textarea
                      value={form.content}
                      onChange={e => setForm(prev => ({ ...prev, content: e.target.value }))}
                      placeholder={`# Titre de l'article\n\nIntroduction...\n\n## Section\n\nContenu avec **gras**, *italique*, \`code\`...\n\n- Element 1\n- Element 2`}
                      rows={18}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] font-mono text-sm placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF] resize-none leading-relaxed"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Supporte : # Titres, **gras**, *italique*, `code`, ```blocs```, - listes, 1. listes, &gt; citations, [lien](url), ---
                    </p>
                  </div>
                </div>
              ) : (
                /* Preview tab */
                <div className="p-6">
                  {form.title && (
                    <h1 className="text-2xl font-bold text-[#040741] mb-2">{form.title}</h1>
                  )}
                  <div className="flex items-center gap-2 text-xs text-gray-400 mb-6">
                    <span className="px-2 py-0.5 bg-[#313ADF]/10 text-[#313ADF] rounded-lg font-medium">
                      {CATEGORIES.find(c => c.key === form.category)?.label || form.category}
                    </span>
                    <span>·</span>
                    <span className={form.is_published ? 'text-green-600' : 'text-gray-400'}>
                      {form.is_published ? 'Publie' : 'Brouillon'}
                    </span>
                  </div>
                  <div dangerouslySetInnerHTML={renderMarkdown(form.content)} />
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => setModalOpen(false)}
                className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2.5 bg-[#313ADF] text-white rounded-xl font-bold hover:bg-[#4149e8] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Enregistrement...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {editingId ? 'Mettre a jour' : 'Creer l\'article'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ── */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-[#040741] text-center mb-2">Supprimer l'article ?</h3>
            <p className="text-gray-500 text-center text-sm mb-6">
              "<span className="font-medium">{confirmDelete.title}</span>" sera supprime definitvement.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={() => handleDelete(confirmDelete.id)}
                disabled={deleting === confirmDelete.id}
                className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {deleting === confirmDelete.id ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
