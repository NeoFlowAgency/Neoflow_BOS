import { useState, useEffect, useCallback, useRef } from 'react'
import { listArticles, searchArticles, getArticle } from '../services/documentationService'

const CATEGORIES = [
  { key: 'prise-en-main', label: 'Prise en main' },
  { key: 'ventes',         label: 'Ventes' },
  { key: 'stock',          label: 'Stock' },
  { key: 'fournisseurs',   label: 'Fournisseurs' },
  { key: 'livraisons',     label: 'Livraisons' },
  { key: 'statistiques',   label: 'Statistiques' },
  { key: 'faq',            label: 'FAQ' },
]

// ─── Markdown renderer (no external deps) ───────────────────────────────────

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function inlineMd(str) {
  return str
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono text-[#313ADF]">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-[#040741]">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em class="italic">$1</em>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-[#313ADF] underline hover:text-[#4149e8]" target="_blank" rel="noopener noreferrer">$1</a>')
}

function renderMarkdown(text) {
  if (!text) return { __html: '' }
  const lines = text.split('\n')
  const html = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Code block
    if (line.startsWith('```')) {
      const codeLines = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(escHtml(lines[i]))
        i++
      }
      html.push(`<pre class="bg-gray-900 text-green-300 rounded-xl p-4 overflow-x-auto text-sm font-mono my-4 leading-relaxed"><code>${codeLines.join('\n')}</code></pre>`)
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

// ────────────────────────────────────────────────────────────────────────────

export default function Documentation() {
  const [articles, setArticles] = useState([])
  const [selectedArticle, setSelectedArticle] = useState(null)
  const [loadingArticles, setLoadingArticles] = useState(true)
  const [loadingContent, setLoadingContent] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [expandedCats, setExpandedCats] = useState({})
  const [mobileTab, setMobileTab] = useState('nav') // 'nav' | 'content'
  const searchTimeout = useRef(null)

  useEffect(() => {
    loadArticles()
  }, [])

  const loadArticles = async () => {
    try {
      const data = await listArticles()
      setArticles(data)
      // Expand all categories by default
      const cats = {}
      data.forEach(a => { cats[a.category] = true })
      setExpandedCats(cats)
      // Auto-select first article
      if (data.length > 0) openArticle(data[0].id)
    } catch {
      // Table might not exist yet
    } finally {
      setLoadingArticles(false)
    }
  }

  const openArticle = useCallback(async (articleId) => {
    setLoadingContent(true)
    setMobileTab('content')
    try {
      const article = await getArticle(articleId)
      setSelectedArticle(article)
    } catch {
      setSelectedArticle(null)
    } finally {
      setLoadingContent(false)
    }
  }, [])

  const handleSearch = (q) => {
    setSearchQuery(q)
    clearTimeout(searchTimeout.current)
    if (!q.trim()) {
      setSearchResults(null)
      return
    }
    searchTimeout.current = setTimeout(async () => {
      try {
        const results = await searchArticles(q)
        setSearchResults(results)
      } catch {
        setSearchResults([])
      }
    }, 300)
  }

  const toggleCategory = (cat) => {
    setExpandedCats(prev => ({ ...prev, [cat]: !prev[cat] }))
  }

  // Group articles by category
  const articlesByCategory = {}
  articles.forEach(a => {
    if (!articlesByCategory[a.category]) articlesByCategory[a.category] = []
    articlesByCategory[a.category].push(a)
  })

  // Ordered categories (plan order first, then extras)
  const orderedCats = [
    ...CATEGORIES.filter(c => articlesByCategory[c.key]?.length > 0),
    ...Object.keys(articlesByCategory)
      .filter(k => !CATEGORIES.find(c => c.key === k))
      .map(k => ({ key: k, label: k.charAt(0).toUpperCase() + k.slice(1) }))
  ]

  const NavPanel = () => (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-4 border-b border-gray-100">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Rechercher..."
            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(''); setSearchResults(null) }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Articles list */}
      <div className="flex-1 overflow-y-auto p-2">
        {loadingArticles ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#313ADF] border-t-transparent"></div>
          </div>
        ) : searchResults !== null ? (
          /* Search results */
          <div>
            <p className="text-xs text-gray-400 font-medium px-2 py-1">{searchResults.length} resultat{searchResults.length !== 1 ? 's' : ''}</p>
            {searchResults.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Aucun article trouve</p>
            ) : (
              searchResults.map(a => (
                <button
                  key={a.id}
                  onClick={() => openArticle(a.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors mb-0.5 ${
                    selectedArticle?.id === a.id
                      ? 'bg-[#313ADF] text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <p className="font-medium truncate">{a.title}</p>
                  <p className={`text-xs mt-0.5 ${selectedArticle?.id === a.id ? 'text-white/70' : 'text-gray-400'}`}>
                    {CATEGORIES.find(c => c.key === a.category)?.label || a.category}
                  </p>
                </button>
              ))
            )}
          </div>
        ) : articles.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <p className="text-sm text-gray-500 mb-1">Aucun article disponible</p>
          </div>
        ) : (
          /* Categories tree */
          orderedCats.map(cat => (
            <div key={cat.key} className="mb-1">
              <button
                onClick={() => toggleCategory(cat.key)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{cat.label}</span>
                <svg
                  className={`w-4 h-4 text-gray-400 transition-transform ${expandedCats[cat.key] ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedCats[cat.key] && (
                <div className="space-y-0.5 mb-2">
                  {(articlesByCategory[cat.key] || []).map(a => (
                    <button
                      key={a.id}
                      onClick={() => openArticle(a.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors ${
                        selectedArticle?.id === a.id
                          ? 'bg-[#313ADF] text-white shadow-sm'
                          : 'text-gray-700 hover:bg-[#313ADF]/10 hover:text-[#313ADF]'
                      }`}
                    >
                      <span className="truncate block">{a.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Desktop sidebar nav */}
      <div className="hidden md:flex flex-col w-64 flex-shrink-0 bg-white border-r border-gray-100 shadow-sm">
        <div className="px-4 pt-6 pb-3 border-b border-gray-100">
          <h1 className="text-lg font-bold text-[#040741]">Documentation</h1>
          <p className="text-xs text-gray-400 mt-0.5">{articles.length} article{articles.length !== 1 ? 's' : ''}</p>
        </div>
        <NavPanel />
      </div>

      {/* Mobile header + tabs */}
      <div className="flex flex-col flex-1 min-w-0">
        <div className="md:hidden bg-white border-b border-gray-100 px-4 py-3">
          <h1 className="font-bold text-[#040741]">Documentation</h1>
        </div>
        <div className="md:hidden flex border-b border-gray-100 bg-white">
          <button
            onClick={() => setMobileTab('nav')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${mobileTab === 'nav' ? 'text-[#313ADF] border-b-2 border-[#313ADF]' : 'text-gray-500'}`}
          >
            Navigation
          </button>
          <button
            onClick={() => setMobileTab('content')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${mobileTab === 'content' ? 'text-[#313ADF] border-b-2 border-[#313ADF]' : 'text-gray-500'}`}
          >
            Article
          </button>
        </div>

        {/* Mobile nav panel */}
        {mobileTab === 'nav' && (
          <div className="md:hidden flex-1 bg-white overflow-hidden">
            <NavPanel />
          </div>
        )}

        {/* Main content area */}
        <div className={`flex-1 overflow-y-auto ${mobileTab === 'nav' ? 'hidden md:block' : ''}`}>
          {loadingContent ? (
            <div className="flex items-center justify-center h-full min-h-[400px]">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-[#313ADF] border-t-transparent"></div>
            </div>
          ) : selectedArticle ? (
            <div className="max-w-3xl mx-auto px-6 py-8">
              {/* Breadcrumb */}
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-6">
                <span>{CATEGORIES.find(c => c.key === selectedArticle.category)?.label || selectedArticle.category}</span>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="text-gray-600 font-medium">{selectedArticle.title}</span>
              </div>

              {/* Article content */}
              <div
                className="prose-custom"
                dangerouslySetInnerHTML={renderMarkdown(selectedArticle.content)}
              />

              {/* Footer */}
              <div className="mt-12 pt-6 border-t border-gray-100 text-sm">
                <span className="text-gray-400">
                  {CATEGORIES.find(c => c.key === selectedArticle.category)?.label || selectedArticle.category}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center px-6">
              <div className="w-20 h-20 bg-[#313ADF]/10 rounded-2xl flex items-center justify-center mb-4">
                <svg className="w-10 h-10 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-[#040741] mb-2">Base de connaissances</h2>
              <p className="text-gray-500 max-w-sm">
                Selectionnez un article dans le menu de gauche pour commencer.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
