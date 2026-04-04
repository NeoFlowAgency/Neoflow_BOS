import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import DOMPurify from 'dompurify'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { supabase, streamNeoChat } from '../lib/supabase'

// ─── Constantes ────────────────────────────────────────────────────────────────

const storageKey = (uid) => uid ? `neoflow_neo_chats_${uid}` : null

const SUGGESTIONS = [
  { icon: '📦', label: 'Commandes en cours',   q: 'Quelles sont mes commandes en cours ?' },
  { icon: '📊', label: 'Bilan du mois',         q: 'Quel est le bilan financier de ce mois ?' },
  { icon: '🚚', label: 'Livraisons à venir',    q: 'Quelles livraisons sont prévues prochainement ?' },
  { icon: '⚠️', label: 'Alertes stock',         q: 'Y a-t-il des alertes de stock en ce moment ?' },
  { icon: '👥', label: 'Clients récents',       q: 'Quels sont mes clients les plus récents ?' },
  { icon: '❓', label: 'Créer une commande',    q: 'Comment créer une nouvelle commande étape par étape ?' },
]

// ─── Rendu Markdown ────────────────────────────────────────────────────────────

function inlineFormat(text) {
  const html = text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono text-gray-700">$1</code>')
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: ['strong', 'em', 'code'], ALLOWED_ATTR: ['class'] })
}

function MarkdownText({ content, streaming }) {
  const lines = content.split('\n')
  return (
    <div className="space-y-1.5 text-[15px] leading-relaxed text-gray-800">
      {lines.map((line, i) => {
        if (line.startsWith('### ')) return <h3 key={i} className="font-semibold text-gray-900 mt-3 text-base">{line.slice(4)}</h3>
        if (line.startsWith('## '))  return <h2 key={i} className="font-bold text-gray-900 mt-3 text-lg">{line.slice(3)}</h2>
        if (line.startsWith('# '))   return <h1 key={i} className="font-bold text-gray-900 mt-3 text-xl">{line.slice(2)}</h1>
        if (line.startsWith('• ') || line.startsWith('- ') || line.match(/^[\d]+\. /)) {
          const text = line.replace(/^[•\-] /, '').replace(/^\d+\. /, '')
          return (
            <div key={i} className="flex gap-2 items-start">
              <span className="text-[#313ADF] mt-0.5 flex-shrink-0 text-base">•</span>
              <span dangerouslySetInnerHTML={{ __html: inlineFormat(text) }} />
            </div>
          )
        }
        if (line === '') return <div key={i} className="h-1" />
        return <p key={i} dangerouslySetInnerHTML={{ __html: inlineFormat(line) }} />
      })}
      {streaming && <span className="inline-block w-[2px] h-[16px] bg-gray-700 ml-0.5 animate-pulse align-middle" />}
    </div>
  )
}

// ─── Bouton copier ─────────────────────────────────────────────────────────────

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }
  return (
    <button onClick={copy} title={copied ? 'Copié !' : 'Copier'}
      className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all">
      {copied ? (
        <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  )
}

// ─── Message ──────────────────────────────────────────────────────────────────

function Message({ msg, isStreaming }) {
  const isUser = msg.role === 'user'
  const time = new Date(msg.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] lg:max-w-[70%]">
          <div className="bg-[#313ADF] text-white px-5 py-3.5 rounded-2xl rounded-br-md text-[15px] leading-relaxed">
            {msg.content}
          </div>
          <p className="text-[11px] text-gray-400 text-right mt-1 pr-1">{time}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-4 items-start group max-w-[85%] lg:max-w-[75%]">
      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#313ADF] to-[#040741] flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
        <span className="text-white text-xs font-bold">N</span>
      </div>
      <div className="flex-1 min-w-0">
        <MarkdownText content={msg.content || ''} streaming={isStreaming} />
        {!isStreaming && msg.content && (
          <div className="flex items-center gap-2 mt-2">
            <p className="text-[11px] text-gray-400">{time}</p>
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
              <CopyButton text={msg.content} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Carte d'approbation ───────────────────────────────────────────────────────

function ActionApprovalCard({ action, onApprove, onReject, isProcessing }) {
  const toolIcons = {
    update_order_status: (
      <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    cancel_order: (
      <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    create_delivery: (
      <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
      </svg>
    ),
  }
  return (
    <div className="my-4 border border-orange-200 rounded-2xl overflow-hidden bg-orange-50 max-w-[80%]">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-orange-100 border-b border-orange-200">
        <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span className="text-xs font-semibold text-orange-700">Neo souhaite effectuer une action — votre approbation est requise</span>
      </div>
      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">{toolIcons[action.tool_name] || (
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          )}</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">{action.label}</p>
            {action.details && <p className="text-xs text-gray-500 mt-0.5">{action.details}</p>}
            <div className="mt-2 bg-white border border-orange-100 rounded-lg px-3 py-2">
              <p className="text-[11px] font-mono text-gray-500">
                {Object.entries(action.tool_args || {}).map(([k, v]) => `${k}: ${v}`).join(' · ')}
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="flex gap-2 px-4 pb-3">
        <button onClick={() => onApprove(action)} disabled={isProcessing}
          className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold py-2.5 px-4 rounded-xl transition-colors disabled:opacity-50">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          {isProcessing ? 'Exécution…' : 'Approuver'}
        </button>
        <button onClick={() => onReject(action)} disabled={isProcessing}
          className="flex-1 flex items-center justify-center gap-1.5 bg-white hover:bg-red-50 text-red-500 hover:text-red-600 text-sm font-semibold py-2.5 px-4 rounded-xl border border-red-200 transition-colors disabled:opacity-50">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Annuler
        </button>
      </div>
    </div>
  )
}

// ─── Écran de bienvenue ────────────────────────────────────────────────────────

function WelcomeScreen({ shopName, onSuggestion }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 gap-10">
      <div className="flex flex-col items-center gap-4">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#313ADF] to-[#040741] flex items-center justify-center shadow-xl">
          <span className="text-white text-3xl font-bold">N</span>
        </div>
        <div className="text-center">
          <h1 className="text-gray-900 font-semibold text-2xl">Bonjour, je suis Neo</h1>
          <p className="text-gray-500 text-base mt-1">Assistant IA de {shopName || 'NeoFlow BOS'}</p>
        </div>
      </div>
      <div className="w-full max-w-2xl grid grid-cols-2 md:grid-cols-3 gap-3">
        {SUGGESTIONS.map((s) => (
          <button key={s.q} onClick={() => onSuggestion(s.q)}
            className="flex flex-col gap-3 p-5 rounded-2xl border border-gray-200 bg-white hover:border-[#313ADF]/40 hover:bg-[#313ADF]/5 text-left transition-all group shadow-sm">
            <span className="text-2xl">{s.icon}</span>
            <span className="text-[13px] font-medium text-gray-700 group-hover:text-[#313ADF] leading-snug">{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Composant principal ───────────────────────────────────────────────────────

export default function Neo() {
  const navigate = useNavigate()
  const location = useLocation()
  const { role, currentWorkspace, planType, neoCreditsBalance, isUnlimitedCredits, hasNeoCredits, refreshNeoCredits } = useWorkspace()

  const [userId, setUserId] = useState(null)
  const [localCredits, setLocalCredits] = useState(null)
  const [pendingAction, setPendingAction] = useState(null)
  const [actionProcessing, setActionProcessing] = useState(false)
  const [toolExecuting, setToolExecuting] = useState(null)
  const [chats, setChats] = useState([])
  const [activeChatId, setActiveChatId] = useState(null)
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingMsgId, setStreamingMsgId] = useState(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const abortRef = useRef(null)
  const accRef = useRef('')

  // ── Auth ──
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUserId(session?.user?.id ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUserId(session?.user?.id ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // ── Chargement depuis localStorage ──
  useEffect(() => {
    const key = storageKey(userId)
    if (!key) { setChats([]); setActiveChatId(null); return }
    try {
      const saved = localStorage.getItem(key)
      if (saved) {
        const data = JSON.parse(saved)
        setChats(data.chats || [])
        setActiveChatId(data.activeChatId || null)
      } else {
        setChats([]); setActiveChatId(null)
      }
    } catch { /* ignore */ }
  }, [userId])

  const saveToStorage = useCallback((updatedChats, activeId) => {
    const key = storageKey(userId)
    if (!key) return
    try { localStorage.setItem(key, JSON.stringify({ chats: updatedChats, activeChatId: activeId })) }
    catch { /* ignore */ }
  }, [userId])

  // ── Auto-scroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chats, isStreaming])

  // ── Focus input ──
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [activeChatId])

  // ── Gestion chats ──
  const activeChat = chats.find((c) => c.id === activeChatId)
  const messages = activeChat?.messages || []

  const createNewChat = useCallback(() => {
    const id = `chat_${Date.now()}`
    const newChat = {
      id, title: 'Nouvelle conversation', messages: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }
    const updated = [newChat, ...chats]
    setChats(updated)
    setActiveChatId(id)
    saveToStorage(updated, id)
    setInput('')
    setPendingAction(null)
    setMobileSidebarOpen(false)
  }, [chats, saveToStorage])

  const deleteChat = useCallback((chatId) => {
    const updated = chats.filter((c) => c.id !== chatId)
    const newId = updated[0]?.id || null
    setChats(updated)
    setActiveChatId(newId)
    saveToStorage(updated, newId)
  }, [chats, saveToStorage])

  const selectChat = useCallback((id) => {
    setActiveChatId(id)
    saveToStorage(chats, id)
    setPendingAction(null)
    setMobileSidebarOpen(false)
  }, [chats, saveToStorage])

  // ── Envoi message ──
  const sendMessage = useCallback(async (text) => {
    const trimmed = (text || input).trim()
    if (!trimmed || isStreaming) return

    let chatId = activeChatId
    if (!chatId) {
      const id = `chat_${Date.now()}`
      const newChat = {
        id, title: trimmed.slice(0, 40), messages: [],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }
      const updated = [newChat, ...chats]
      setChats(updated)
      setActiveChatId(id)
      saveToStorage(updated, id)
      chatId = id
    }

    const userMsgId = `u_${Date.now()}`
    const asMsgId   = `a_${Date.now()}`
    const userMsg = { id: userMsgId, role: 'user', content: trimmed, timestamp: new Date().toISOString() }
    const asMsg   = { id: asMsgId,   role: 'assistant', content: '', timestamp: new Date().toISOString() }

    const currentMessages = chats.find(c => c.id === chatId)?.messages || []
    const isFirst = currentMessages.filter(m => m.role === 'user').length === 0
    const title = isFirst ? trimmed.slice(0, 45) + (trimmed.length > 45 ? '…' : '') : undefined
    const historySnapshot = currentMessages.filter(m => m.id !== 'welcome').slice(-6).map(m => ({ role: m.role, content: m.content }))

    setChats(prev => {
      const updated = prev.map(c => c.id === chatId ? {
        ...c, messages: [...c.messages, userMsg, asMsg],
        ...(title ? { title } : {}), updatedAt: new Date().toISOString(),
      } : c)
      return updated
    })
    setInput('')
    setIsStreaming(true)
    setStreamingMsgId(asMsgId)
    accRef.current = ''
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    await streamNeoChat(
      {
        message: trimmed,
        context: {
          page: location.pathname, role: role || 'unknown',
          workspace_name: currentWorkspace?.name || 'NeoFlow BOS',
          workspace_id: currentWorkspace?.id,
        },
        history: historySnapshot,
      },
      (token) => {
        accRef.current += token
        const content = accRef.current
        setChats(prev => prev.map(c => c.id === chatId ? {
          ...c, messages: c.messages.map(m => m.id === asMsgId ? { ...m, content } : m),
        } : c))
      },
      () => {
        setChats(prev => { saveToStorage(prev, chatId); return prev })
        setIsStreaming(false); setStreamingMsgId(null); setToolExecuting(null)
        accRef.current = ''; refreshNeoCredits()
      },
      (err) => {
        const errContent = `*Une erreur s'est produite : ${err.message}*`
        setChats(prev => {
          const updated = prev.map(c => c.id === chatId ? {
            ...c, messages: c.messages.map(m => m.id === asMsgId ? { ...m, content: errContent } : m),
          } : c)
          saveToStorage(updated, chatId); return updated
        })
        setIsStreaming(false); setStreamingMsgId(null); accRef.current = ''
      },
      abortRef.current.signal,
      (meta) => {
        if (meta.credits_remaining !== undefined) setLocalCredits(meta.credits_remaining)
        if (meta.pending_action) {
          setPendingAction(meta.pending_action)
          setIsStreaming(false); setStreamingMsgId(null)
        }
        if (meta.tool_executing) setToolExecuting(meta.tool_executing)
      },
    )
  }, [input, activeChatId, isStreaming, chats, location, role, currentWorkspace, saveToStorage, refreshNeoCredits])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  // ── Approbation actions ──
  const handleApproveAction = useCallback(async (action) => {
    if (!activeChatId || actionProcessing) return
    setActionProcessing(true)

    const approvedMsgId = `a_approved_${Date.now()}`
    const approvedMsg = { id: approvedMsgId, role: 'assistant', content: '', timestamp: new Date().toISOString() }

    setChats(prev => prev.map(c => c.id === activeChatId ? {
      ...c, messages: [...c.messages, approvedMsg], updatedAt: new Date().toISOString(),
    } : c))

    setIsStreaming(true); setStreamingMsgId(approvedMsgId)
    accRef.current = ''; abortRef.current?.abort(); abortRef.current = new AbortController()

    const currentMessages = chats.find(c => c.id === activeChatId)?.messages || []
    const historySnapshot = currentMessages.filter(m => m.id !== 'welcome').slice(-10).map(m => ({ role: m.role, content: m.content }))

    await streamNeoChat(
      {
        message: `[Action approuvée] ${action.label}`,
        context: { page: location.pathname, role: role || 'unknown', workspace_name: currentWorkspace?.name || 'NeoFlow BOS', workspace_id: currentWorkspace?.id, approved_action: action },
        history: historySnapshot,
        approved_action_id: action.id,
        approved_action_result: 'approved',
      },
      (token) => {
        accRef.current += token
        const content = accRef.current
        setChats(prev => prev.map(c => c.id === activeChatId ? {
          ...c, messages: c.messages.map(m => m.id === approvedMsgId ? { ...m, content } : m),
        } : c))
      },
      () => {
        setChats(prev => { saveToStorage(prev, activeChatId); return prev })
        setIsStreaming(false); setStreamingMsgId(null); accRef.current = ''; refreshNeoCredits()
      },
      (err) => {
        const errContent = `*Erreur exécution action : ${err.message}*`
        setChats(prev => {
          const updated = prev.map(c => c.id === activeChatId ? {
            ...c, messages: c.messages.map(m => m.id === approvedMsgId ? { ...m, content: errContent } : m),
          } : c)
          saveToStorage(updated, activeChatId); return updated
        })
        setIsStreaming(false); setStreamingMsgId(null)
      },
      abortRef.current.signal,
      (meta) => { if (meta.credits_remaining !== undefined) setLocalCredits(meta.credits_remaining) },
    )

    setPendingAction(null); setActionProcessing(false)
  }, [activeChatId, actionProcessing, chats, location, role, currentWorkspace, saveToStorage, refreshNeoCredits])

  const handleRejectAction = useCallback((action) => {
    setPendingAction(null)
    if (!activeChatId) return
    const rejectedMsg = {
      id: `rejected_${Date.now()}`, role: 'assistant',
      content: `Action annulée : "${action.label}". Comment puis-je vous aider autrement ?`,
      timestamp: new Date().toISOString(),
    }
    setChats(prev => {
      const updated = prev.map(c => c.id === activeChatId ? {
        ...c, messages: [...c.messages, rejectedMsg], updatedAt: new Date().toISOString(),
      } : c)
      saveToStorage(updated, activeChatId); return updated
    })
  }, [activeChatId, saveToStorage])

  // ── Ouvrir en mode panneau latéral ──
  const openAsPanel = () => {
    navigate(-1)
    setTimeout(() => window.dispatchEvent(new CustomEvent('neoflow:open-neo')), 100)
  }

  const creditsDisplay = localCredits ?? neoCreditsBalance
  const modelLabel = (planType === 'pro' || planType === 'enterprise' || planType === 'early-access') ? 'OpenRouter' : 'Ollama'

  // ── Sidebar conversations ──
  function ConvSidebar() {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#313ADF] to-[#040741] flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm font-bold">N</span>
            </div>
            {!sidebarCollapsed && <span className="font-semibold text-gray-900 text-sm">Neo</span>}
          </div>
          <button
            onClick={() => setSidebarCollapsed(v => !v)}
            className="hidden md:flex p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title={sidebarCollapsed ? 'Déplier' : 'Replier'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {sidebarCollapsed
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              }
            </svg>
          </button>
          {/* Mobile close */}
          <button
            onClick={() => setMobileSidebarOpen(false)}
            className="md:hidden p-1.5 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Nouveau chat */}
        <div className={`px-3 pb-3 flex-shrink-0 ${sidebarCollapsed ? 'px-2' : ''}`}>
          <button
            onClick={createNewChat}
            className={`w-full flex items-center gap-2 px-3 py-2.5 bg-[#313ADF] text-white rounded-xl text-sm font-medium hover:bg-[#2730c4] transition-colors ${sidebarCollapsed ? 'justify-center px-2' : ''}`}
            title={sidebarCollapsed ? 'Nouvelle conversation' : ''}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {!sidebarCollapsed && <span>Nouvelle conversation</span>}
          </button>
        </div>

        {/* Liste */}
        {!sidebarCollapsed && (
          <>
            {chats.length > 0 && (
              <p className="px-4 text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1 flex-shrink-0">
                Conversations
              </p>
            )}
            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5 min-h-0">
              {chats.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-8 px-3">Aucune conversation.<br />Commencez à parler à Neo !</p>
              )}
              {chats.map((chat) => (
                <div
                  key={chat.id}
                  className={`group relative flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                    chat.id === activeChatId ? 'bg-[#313ADF]/10 text-[#313ADF]' : 'hover:bg-gray-100 text-gray-700'
                  }`}
                  onClick={() => selectChat(chat.id)}
                >
                  <svg className="w-3.5 h-3.5 flex-shrink-0 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium truncate">{chat.title || 'Nouvelle conversation'}</p>
                    <p className="text-[10px] opacity-50 mt-0.5">
                      {new Date(chat.updatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteChat(chat.id) }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-red-50 hover:text-red-500 transition-all text-gray-400 flex-shrink-0"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Footer — crédits + actions */}
        <div className={`flex-shrink-0 border-t border-gray-100 p-3 space-y-2 ${sidebarCollapsed ? 'px-2' : ''}`}>
          {/* Tokens */}
          {!isUnlimitedCredits && !sidebarCollapsed && (
            <div className="px-2 py-2 bg-gray-50 rounded-xl">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-gray-500">Tokens restants</span>
                <span className={`text-[12px] font-bold ${creditsDisplay <= 10 ? 'text-red-500' : creditsDisplay <= 50 ? 'text-orange-500' : 'text-gray-700'}`}>
                  {creditsDisplay}
                </span>
              </div>
              <button
                onClick={() => navigate('/settings?tab=abonnement')}
                className="w-full text-[11px] text-[#313ADF] hover:underline text-left"
              >
                Acheter des tokens →
              </button>
            </div>
          )}

          {/* Ouvrir en panneau */}
          {!sidebarCollapsed && (
            <button
              onClick={openAsPanel}
              className="w-full flex items-center gap-2 px-3 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl text-[12px] transition-colors"
              title="Ouvrir en panneau latéral"
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
              </svg>
              Mode panneau
            </button>
          )}

          {/* Retour */}
          <button
            onClick={() => navigate('/dashboard')}
            className={`w-full flex items-center gap-2 px-3 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl text-[12px] transition-colors ${sidebarCollapsed ? 'justify-center' : ''}`}
            title="Retour au dashboard"
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {!sidebarCollapsed && <span>Retour</span>}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-white overflow-hidden">

      {/* ── Sidebar desktop ── */}
      <div className={`hidden md:flex flex-col flex-shrink-0 border-r border-gray-100 bg-white transition-all duration-200 ${
        sidebarCollapsed ? 'w-[60px]' : 'w-[260px]'
      }`}>
        <ConvSidebar />
      </div>

      {/* ── Sidebar mobile (overlay) ── */}
      {mobileSidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="w-[280px] bg-white border-r border-gray-100 flex flex-col h-full">
            <ConvSidebar />
          </div>
          <div className="flex-1 bg-black/40" onClick={() => setMobileSidebarOpen(false)} />
        </div>
      )}

      {/* ── Zone principale ── */}
      <div className="flex flex-col flex-1 min-w-0 h-screen">

        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 flex-shrink-0 bg-white">
          {/* Hamburger mobile */}
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="md:hidden p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          </button>

          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 text-sm truncate">
              {activeChat?.title || 'Nouvelle conversation'}
            </p>
          </div>

          {/* Statut */}
          <div className="hidden sm:flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${
              pendingAction ? 'bg-orange-400 animate-pulse' :
              isStreaming || toolExecuting ? 'bg-yellow-400 animate-pulse' :
              'bg-emerald-400'
            }`} />
            <span className="text-[12px] text-gray-400">
              {pendingAction ? 'Attend votre approbation' :
               toolExecuting ? `Exécute ${toolExecuting}…` :
               isStreaming ? 'Rédige une réponse…' :
               modelLabel}
            </span>
            {!isUnlimitedCredits && (
              <span className={`text-[12px] font-medium ml-1 ${creditsDisplay <= 10 ? 'text-red-500' : 'text-gray-400'}`}>
                · {creditsDisplay} tokens
              </span>
            )}
          </div>

          {/* Nouveau chat */}
          <button onClick={createNewChat} title="Nouvelle conversation"
            className="p-2 text-gray-500 hover:text-[#313ADF] hover:bg-[#313ADF]/5 rounded-lg transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        </div>

        {/* Zone messages */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {messages.length === 0 ? (
            <WelcomeScreen shopName={currentWorkspace?.name} onSuggestion={(q) => sendMessage(q)} />
          ) : (
            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
              {messages.map((msg) => (
                <Message key={msg.id} msg={msg} isStreaming={isStreaming && msg.id === streamingMsgId} />
              ))}

              {/* Indicateur outil */}
              {toolExecuting && (
                <div className="flex items-center gap-2 text-xs text-gray-400 pl-12">
                  <svg className="w-3.5 h-3.5 animate-spin text-[#313ADF]" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Recherche en cours ({toolExecuting})…
                </div>
              )}

              {/* Carte d'approbation */}
              {pendingAction && (
                <div className="pl-12">
                  <ActionApprovalCard
                    action={pendingAction}
                    onApprove={handleApproveAction}
                    onReject={handleRejectAction}
                    isProcessing={actionProcessing}
                  />
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ── Barre d'input ── */}
        <div className="flex-shrink-0 border-t border-gray-100 bg-white px-4 py-3">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-3 bg-gray-50 rounded-2xl border border-gray-200 focus-within:border-[#313ADF]/50 focus-within:ring-2 focus-within:ring-[#313ADF]/10 transition-all px-4 py-3">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={pendingAction ? 'Approuvez ou refusez l\'action ci-dessus…' : 'Posez une question à Neo…'}
                disabled={isStreaming || !!pendingAction}
                rows={1}
                className="flex-1 bg-transparent resize-none outline-none text-[15px] text-gray-800 placeholder-gray-400 min-h-[24px] max-h-[160px] leading-relaxed disabled:opacity-50"
                style={{ height: 'auto' }}
                onInput={(e) => {
                  e.target.style.height = 'auto'
                  e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
                }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || isStreaming || !!pendingAction}
                className="flex-shrink-0 w-9 h-9 bg-[#313ADF] hover:bg-[#2730c4] disabled:bg-gray-200 text-white rounded-xl flex items-center justify-center transition-colors"
              >
                {isStreaming ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-[11px] text-gray-400 text-center mt-2">
              Entrée pour envoyer · Maj+Entrée pour saut de ligne
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
