import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { supabase, streamNeoChat } from '../lib/supabase'

// ─── Constantes ────────────────────────────────────────────────────────────────

const storageKey = (uid) => uid ? `neoflow_neo_chats_${uid}` : null

const SUGGESTIONS = [
  { icon: '📦', label: 'Commandes en cours', q: 'Quelles sont mes commandes en cours ?' },
  { icon: '📊', label: 'Bilan du mois',      q: 'Quel est le bilan financier de ce mois ?' },
  { icon: '🚚', label: 'Livraisons à venir', q: 'Quelles livraisons sont prévues prochainement ?' },
  { icon: '❓', label: 'Créer une commande', q: 'Comment créer une nouvelle commande étape par étape ?' },
]

// ─── Rendu Markdown simple ─────────────────────────────────────────────────────

function MarkdownText({ content, streaming }) {
  const lines = content.split('\n')
  return (
    <div className="space-y-1.5 text-[14px] leading-relaxed text-gray-800">
      {lines.map((line, i) => {
        if (line.startsWith('### ')) return <h3 key={i} className="font-semibold text-gray-900 mt-2">{line.slice(4)}</h3>
        if (line.startsWith('## '))  return <h2 key={i} className="font-semibold text-gray-900 mt-2">{line.slice(3)}</h2>
        if (line.startsWith('# '))   return <h1 key={i} className="font-semibold text-gray-900 mt-2">{line.slice(2)}</h1>
        if (line.startsWith('• ') || line.startsWith('- ') || line.match(/^[\d]+\. /)) {
          const text = line.replace(/^[•\-] /, '').replace(/^\d+\. /, '')
          return (
            <div key={i} className="flex gap-2 items-start">
              <span className="text-[#313ADF] mt-0.5 flex-shrink-0">•</span>
              <span dangerouslySetInnerHTML={{ __html: inlineFormat(text) }} />
            </div>
          )
        }
        if (line === '') return <div key={i} className="h-1" />
        return <p key={i} dangerouslySetInnerHTML={{ __html: inlineFormat(line) }} />
      })}
      {streaming && <span className="inline-block w-[2px] h-[14px] bg-gray-700 ml-0.5 animate-pulse align-middle" />}
    </div>
  )
}

function inlineFormat(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono text-gray-700">$1</code>')
}

// ─── Bulle de message ──────────────────────────────────────────────────────────

function Message({ msg, isStreaming }) {
  const isUser = msg.role === 'user'
  const time = new Date(msg.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%]">
          <div className="bg-[#313ADF] text-white px-4 py-3 rounded-2xl rounded-br-md text-[14px] leading-relaxed">
            {msg.content}
          </div>
          <p className="text-[11px] text-gray-400 text-right mt-1 pr-1">{time}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3 items-start">
      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#313ADF] to-[#040741] flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
        <span className="text-white text-[11px] font-bold">N</span>
      </div>
      <div className="flex-1 min-w-0">
        <MarkdownText content={msg.content || ''} streaming={isStreaming} />
        {!isStreaming && msg.content && (
          <p className="text-[11px] text-gray-400 mt-1.5">{time}</p>
        )}
      </div>
    </div>
  )
}

// ─── Écran d'accueil (suggestions) ────────────────────────────────────────────

function WelcomeScreen({ shopName, onSuggestion }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-8">
      {/* Avatar */}
      <div className="flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#313ADF] to-[#040741] flex items-center justify-center shadow-lg">
          <span className="text-white text-2xl font-bold">N</span>
        </div>
        <div className="text-center">
          <h2 className="text-gray-900 font-semibold text-lg">Bonjour, je suis Neo</h2>
          <p className="text-gray-500 text-sm mt-0.5">Assistant IA de {shopName || 'NeoFlow BOS'}</p>
        </div>
      </div>

      {/* Suggestions */}
      <div className="w-full grid grid-cols-2 gap-2.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.q}
            onClick={() => onSuggestion(s.q)}
            className="flex flex-col gap-2 p-4 rounded-xl border border-gray-200 bg-white hover:border-[#313ADF]/40 hover:bg-[#313ADF]/5 text-left transition-all group"
          >
            <span className="text-xl">{s.icon}</span>
            <span className="text-[13px] font-medium text-gray-700 group-hover:text-[#313ADF] leading-snug">{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Liste conversations ───────────────────────────────────────────────────────

function ConversationList({ chats, activeChatId, onSelect, onNew, onDelete, onClose }) {
  return (
    <div className="absolute inset-0 bg-white z-10 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900 text-sm">Conversations</h3>
        <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* New chat button */}
      <div className="px-3 pt-3 pb-2">
        <button
          onClick={() => { onNew(); onClose() }}
          className="w-full flex items-center gap-2 px-3 py-2.5 bg-[#313ADF] text-white rounded-xl text-sm font-medium hover:bg-[#2730c4] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nouvelle conversation
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
        {chats.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-8">Aucune conversation</p>
        )}
        {chats.map((chat) => (
          <div
            key={chat.id}
            className={`group relative flex items-center gap-2 px-3 py-3 rounded-xl cursor-pointer transition-colors ${
              chat.id === activeChatId ? 'bg-[#313ADF]/10 text-[#313ADF]' : 'hover:bg-gray-100 text-gray-700'
            }`}
            onClick={() => { onSelect(chat.id); onClose() }}
          >
            <svg className="w-4 h-4 flex-shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{chat.title || 'Nouvelle conversation'}</p>
              <p className="text-[11px] opacity-50 mt-0.5">
                {new Date(chat.updatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
              </p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(chat.id) }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-red-50 hover:text-red-500 transition-all text-gray-400"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Composant principal ───────────────────────────────────────────────────────

export default function NeoChat() {
  const location = useLocation()
  const { role, currentWorkspace } = useWorkspace()

  const [isOpen, setIsOpen] = useState(false)
  const [showConvList, setShowConvList] = useState(false)
  const [userId, setUserId] = useState(null)
  const [chats, setChats] = useState([])
  const [activeChatId, setActiveChatId] = useState(null)
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingMsgId, setStreamingMsgId] = useState(null)

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const abortRef = useRef(null)
  const accRef = useRef('')

  // ── Auth: clé localStorage par user ──
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUserId(session?.user?.id ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUserId(session?.user?.id ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // ── Chargement chats depuis localStorage ──
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

  // ── Focus input à l'ouverture ──
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100)
  }, [isOpen])

  // ── Écoute event ouverture depuis sidebar ──
  useEffect(() => {
    const h = () => { setIsOpen(true) }
    window.addEventListener('neoflow:open-neo', h)
    return () => window.removeEventListener('neoflow:open-neo', h)
  }, [])

  // ── Gestion des chats ──
  const activeChat = chats.find((c) => c.id === activeChatId)
  const messages = activeChat?.messages || []

  const createNewChat = useCallback(() => {
    const id = `chat_${Date.now()}`
    const newChat = {
      id,
      title: 'Nouvelle conversation',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const updated = [newChat, ...chats]
    setChats(updated)
    setActiveChatId(id)
    saveToStorage(updated, id)
    setInput('')
  }, [chats, saveToStorage])

  // Créer un chat si aucun à l'ouverture
  useEffect(() => {
    if (!isOpen) return
    if (chats.length === 0) createNewChat()
    else if (!activeChatId && chats.length > 0) setActiveChatId(chats[0].id)
  }, [isOpen, chats.length])

  const deleteChat = useCallback((chatId) => {
    const updated = chats.filter((c) => c.id !== chatId)
    const newId = updated[0]?.id || null
    setChats(updated)
    setActiveChatId(newId)
    saveToStorage(updated, newId)
  }, [chats, saveToStorage])

  // ── Envoi message avec streaming ──
  const sendMessage = useCallback(async (text) => {
    const trimmed = (text || input).trim()
    if (!trimmed || isStreaming) return

    // S'assurer qu'il y a un chat actif
    let chatId = activeChatId
    if (!chatId) {
      const id = `chat_${Date.now()}`
      const newChat = {
        id,
        title: trimmed.slice(0, 40),
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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

    const historySnapshot = currentMessages
      .filter(m => m.id !== 'welcome')
      .slice(-6)
      .map(m => ({ role: m.role, content: m.content }))

    setChats(prev => {
      const updated = prev.map(c => c.id === chatId ? {
        ...c,
        messages: [...c.messages, userMsg, asMsg],
        ...(title ? { title } : {}),
        updatedAt: new Date().toISOString(),
      } : c)
      return updated
    })

    setInput('')
    setIsStreaming(true)
    setStreamingMsgId(asMsgId)
    accRef.current = ''

    // Annuler tout stream précédent
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    await streamNeoChat(
      {
        message: trimmed,
        context: {
          page:           location.pathname,
          role:           role || 'unknown',
          workspace_name: currentWorkspace?.name || 'NeoFlow BOS',
          workspace_id:   currentWorkspace?.id,
        },
        history: historySnapshot,
      },
      // onToken
      (token) => {
        accRef.current += token
        const content = accRef.current
        setChats(prev => prev.map(c => c.id === chatId ? {
          ...c,
          messages: c.messages.map(m => m.id === asMsgId ? { ...m, content } : m),
        } : c))
      },
      // onDone
      () => {
        setChats(prev => {
          saveToStorage(prev, chatId)
          return prev
        })
        setIsStreaming(false)
        setStreamingMsgId(null)
        accRef.current = ''
      },
      // onError
      (err) => {
        const errContent = `*Une erreur s'est produite : ${err.message}*`
        setChats(prev => {
          const updated = prev.map(c => c.id === chatId ? {
            ...c,
            messages: c.messages.map(m => m.id === asMsgId ? { ...m, content: errContent } : m),
          } : c)
          saveToStorage(updated, chatId)
          return updated
        })
        setIsStreaming(false)
        setStreamingMsgId(null)
        accRef.current = ''
      },
      abortRef.current.signal,
    )
  }, [input, activeChatId, isStreaming, chats, location, role, currentWorkspace, saveToStorage])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  // ── Bouton flottant ──
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 bg-gradient-to-r from-[#313ADF] to-[#040741] text-white pl-3 pr-4 py-2.5 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200"
        title="Ouvrir Neo"
      >
        <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
          <span className="text-white text-xs font-bold">N</span>
        </div>
        <span className="text-sm font-semibold">Neo</span>
        <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm" />
      </button>
    )
  }

  // ── Panel principal ──
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/25 backdrop-blur-[2px] z-40 transition-opacity"
        onClick={() => setIsOpen(false)}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-screen w-full max-w-[460px] z-50 flex flex-col bg-white shadow-2xl">

        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-4 py-3.5 bg-gradient-to-r from-[#313ADF] to-[#040741] flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm font-bold">N</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm leading-tight">Neo — Assistant IA</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isStreaming ? 'bg-yellow-400 animate-pulse' : 'bg-emerald-400'}`} />
              <span className="text-white/60 text-[11px]">
                {isStreaming ? 'Rédige une réponse…' : 'En ligne · Ollama'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            {/* Conversations toggle */}
            <button
              onClick={() => setShowConvList(true)}
              title="Conversations"
              className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </button>
            {/* Nouveau chat */}
            <button
              onClick={createNewChat}
              title="Nouveau chat"
              className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            {/* Fermer */}
            <button
              onClick={() => setIsOpen(false)}
              title="Fermer"
              className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Contenu (relatif pour la liste conversations) ── */}
        <div className="relative flex flex-col flex-1 min-h-0">

          {/* Liste conversations (overlay) */}
          {showConvList && (
            <ConversationList
              chats={chats}
              activeChatId={activeChatId}
              onSelect={setActiveChatId}
              onNew={createNewChat}
              onDelete={deleteChat}
              onClose={() => setShowConvList(false)}
            />
          )}

          {/* Zone messages */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {messages.length === 0 ? (
              <WelcomeScreen
                shopName={currentWorkspace?.name}
                onSuggestion={(q) => sendMessage(q)}
              />
            ) : (
              <div className="px-5 py-5 space-y-5">
                {messages.map((msg) => (
                  <Message
                    key={msg.id}
                    msg={msg}
                    isStreaming={isStreaming && msg.id === streamingMsgId}
                  />
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* ── Zone de saisie ── */}
          <div className="flex-shrink-0 border-t border-gray-100 bg-white px-4 py-3">
            <div className="flex gap-2 items-end bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2.5 focus-within:border-[#313ADF]/50 focus-within:bg-white transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Posez votre question à Neo…"
                rows={1}
                disabled={isStreaming}
                className="flex-1 resize-none bg-transparent text-sm text-gray-800 placeholder-gray-400 focus:outline-none max-h-32 overflow-y-auto disabled:opacity-60"
                style={{ minHeight: '22px' }}
                onInput={(e) => {
                  e.target.style.height = 'auto'
                  e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px'
                }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || isStreaming}
                className="flex-shrink-0 w-8 h-8 bg-[#313ADF] text-white rounded-xl flex items-center justify-center hover:bg-[#2730c4] disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:scale-105"
              >
                {isStreaming ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
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
    </>
  )
}
