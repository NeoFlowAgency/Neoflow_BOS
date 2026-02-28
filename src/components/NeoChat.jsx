import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { invokeFunction } from '../lib/supabase'

// ─── Constantes ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'neoflow_neo_chats'
const DEFAULT_SIZE = { width: 400, height: 560 }
const MIN_SIZE = { width: 320, height: 400 }
const DEFAULT_POS = { x: null, y: null } // null = calculé au premier open

const WELCOME_MESSAGE = {
  id: 'welcome',
  role: 'assistant',
  content: 'Bonjour ! Je suis **Neo**, votre assistant IA NeoFlow BOS. Je peux vous aider à comprendre les fonctionnalités, répondre à vos questions et vous guider dans votre activité quotidienne.\n\nQue puis-je faire pour vous ?',
  timestamp: new Date().toISOString(),
}

// ─── Formatage markdown simplifié ────────────────────────────────────────────

function renderMarkdown(text) {
  const lines = text.split('\n')
  return lines.map((line, i) => {
    // Bold
    line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    line = line.replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    line = line.replace(/`(.+?)`/g, '<code class="bg-gray-100 px-1 rounded text-xs font-mono">$1</code>')
    if (line === '') return <br key={i} />
    return <p key={i} dangerouslySetInnerHTML={{ __html: line }} className="leading-relaxed" />
  })
}

// ─── Bulle de message ─────────────────────────────────────────────────────────

function MessageBubble({ message }) {
  const isUser = message.role === 'user'
  const time = new Date(message.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'} items-end`}>
      {/* Avatar */}
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#313ADF] to-[#040741] flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
          N
        </div>
      )}

      <div className={`max-w-[80%] flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`px-3 py-2 rounded-2xl text-sm ${
            isUser
              ? 'bg-[#313ADF] text-white rounded-br-sm'
              : 'bg-gray-100 text-gray-800 rounded-bl-sm'
          }`}
        >
          {isUser ? (
            <p className="leading-relaxed">{message.content}</p>
          ) : (
            <div className="flex flex-col gap-0.5">{renderMarkdown(message.content)}</div>
          )}
        </div>
        <span className="text-[10px] text-gray-400 px-1">{time}</span>
      </div>
    </div>
  )
}

// ─── Indicateur de frappe ─────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex gap-2 items-end">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#313ADF] to-[#040741] flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
        N
      </div>
      <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
        <div className="flex gap-1 items-center">
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}

// ─── Panneau conversations (sidebar gauche) ──────────────────────────────────

function ConversationSidebar({ chats, activeChatId, onSelect, onNew, onDelete }) {
  return (
    <div className="w-48 flex-shrink-0 border-r border-gray-100 flex flex-col bg-gray-50/50">
      <div className="p-3 border-b border-gray-100">
        <button
          onClick={onNew}
          className="w-full flex items-center gap-2 px-3 py-2 bg-[#313ADF] text-white rounded-xl text-xs font-semibold hover:bg-[#2730c4] transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nouveau chat
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {chats.map((chat) => (
          <div
            key={chat.id}
            className={`group relative rounded-lg cursor-pointer transition-colors ${
              chat.id === activeChatId ? 'bg-[#313ADF]/10' : 'hover:bg-gray-100'
            }`}
            onClick={() => onSelect(chat.id)}
          >
            <div className="px-2.5 py-2 pr-7">
              <p className={`text-xs font-medium truncate ${chat.id === activeChatId ? 'text-[#313ADF]' : 'text-gray-700'}`}>
                {chat.title || 'Nouveau chat'}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {new Date(chat.updatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
              </p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(chat.id) }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-500 transition-all"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
        {chats.length === 0 && (
          <p className="text-[10px] text-gray-400 text-center py-4 px-2">Aucune conversation</p>
        )}
      </div>
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function NeoChat() {
  const location = useLocation()
  const { role, currentWorkspace } = useWorkspace()

  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [showSidebar, setShowSidebar] = useState(true)

  // Position & taille
  const [position, setPosition] = useState(DEFAULT_POS)
  const [size, setSize] = useState(DEFAULT_SIZE)

  // Chat state
  const [chats, setChats] = useState([])
  const [activeChatId, setActiveChatId] = useState(null)
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)

  // Refs pour drag/resize
  const windowRef = useRef(null)
  const isDragging = useRef(false)
  const isResizing = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 })
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 })
  const messagesEndRef = useRef(null)

  // ── Persistence localStorage ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const data = JSON.parse(saved)
        setChats(data.chats || [])
        setActiveChatId(data.activeChatId || null)
      }
    } catch { /* ignore */ }
  }, [])

  const saveToStorage = useCallback((updatedChats, updatedActiveId) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        chats: updatedChats,
        activeChatId: updatedActiveId,
      }))
    } catch { /* ignore */ }
  }, [])

  // ── Auto-scroll messages ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chats, isTyping])

  // ── Écouter l'event d'ouverture depuis la sidebar ──
  useEffect(() => {
    const handler = () => {
      setIsOpen(true)
      setIsMinimized(false)
    }
    window.addEventListener('neoflow:open-neo', handler)
    return () => window.removeEventListener('neoflow:open-neo', handler)
  }, [])

  // ── Position initiale (centré sur l'écran) ──
  useEffect(() => {
    if (isOpen && position.x === null) {
      const x = Math.max(20, window.innerWidth - size.width - 40)
      const y = Math.max(20, window.innerHeight - size.height - 40)
      setPosition({ x, y })
    }
  }, [isOpen])

  // ── Drag ──
  const startDrag = useCallback((e) => {
    if (e.target.closest('button') || e.target.closest('input')) return
    isDragging.current = true
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
    }
    e.preventDefault()
  }, [position])

  // ── Resize ──
  const startResize = useCallback((e) => {
    isResizing.current = true
    resizeStart.current = {
      x: e.clientX,
      y: e.clientY,
      w: size.width,
      h: size.height,
    }
    e.preventDefault()
    e.stopPropagation()
  }, [size])

  useEffect(() => {
    const onMove = (e) => {
      if (isDragging.current) {
        const dx = e.clientX - dragStart.current.x
        const dy = e.clientY - dragStart.current.y
        setPosition({
          x: Math.max(0, Math.min(window.innerWidth - 100, dragStart.current.posX + dx)),
          y: Math.max(0, Math.min(window.innerHeight - 60, dragStart.current.posY + dy)),
        })
      }
      if (isResizing.current) {
        const dx = e.clientX - resizeStart.current.x
        const dy = e.clientY - resizeStart.current.y
        setSize({
          width: Math.max(MIN_SIZE.width, resizeStart.current.w + dx),
          height: Math.max(MIN_SIZE.height, resizeStart.current.h + dy),
        })
      }
    }
    const onUp = () => {
      isDragging.current = false
      isResizing.current = false
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  // ── Gestion des chats ──
  const activeChat = chats.find((c) => c.id === activeChatId)
  const messages = activeChat?.messages || []

  const createNewChat = useCallback(() => {
    const id = `chat_${Date.now()}`
    const newChat = {
      id,
      title: 'Nouveau chat',
      messages: [{ ...WELCOME_MESSAGE, id: `msg_${Date.now()}` }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const updated = [newChat, ...chats]
    setChats(updated)
    setActiveChatId(id)
    saveToStorage(updated, id)
    setInput('')
  }, [chats, saveToStorage])

  // Ouvrir un nouveau chat si aucun actif
  useEffect(() => {
    if (isOpen && chats.length === 0) {
      createNewChat()
    } else if (isOpen && !activeChatId && chats.length > 0) {
      setActiveChatId(chats[0].id)
    }
  }, [isOpen, chats.length])

  const deleteChat = useCallback((chatId) => {
    const updated = chats.filter((c) => c.id !== chatId)
    const newActiveId = updated[0]?.id || null
    setChats(updated)
    setActiveChatId(newActiveId)
    saveToStorage(updated, newActiveId)
  }, [chats, saveToStorage])

  const updateChat = useCallback((chatId, updater) => {
    setChats((prev) => {
      const updated = prev.map((c) => c.id === chatId ? { ...c, ...updater(c) } : c)
      const newActive = activeChatId
      saveToStorage(updated, newActive)
      return updated
    })
  }, [activeChatId, saveToStorage])

  // ── Envoi message ──
  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || !activeChatId || isTyping) return

    const userMsg = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }

    // Titre automatique (premier message)
    const isFirstUserMsg = messages.filter((m) => m.role === 'user').length === 0
    const newTitle = isFirstUserMsg ? text.slice(0, 40) + (text.length > 40 ? '…' : '') : undefined

    // Snapshot de l'historique avant la mise à jour
    const historySnapshot = messages
      .filter((m) => m.role !== 'welcome')
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }))

    updateChat(activeChatId, (c) => ({
      messages: [...c.messages, userMsg],
      updatedAt: new Date().toISOString(),
      ...(newTitle ? { title: newTitle } : {}),
    }))

    setInput('')
    setIsTyping(true)

    try {
      const result = await invokeFunction('neo-chat', {
        message: text,
        context: {
          page: location.pathname,
          role: role || 'unknown',
          workspace_name: currentWorkspace?.name || 'NeoFlow BOS',
          workspace_id: currentWorkspace?.id,
        },
        history: historySnapshot,
      })

      const aiMsg = {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: result.reply || 'Je n\'ai pas pu générer une réponse. Réessayez.',
        timestamp: new Date().toISOString(),
      }

      updateChat(activeChatId, (c) => ({
        messages: [...c.messages, aiMsg],
        updatedAt: new Date().toISOString(),
      }))
    } catch (err) {
      const errorMsg = {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: `*Erreur de connexion à Neo.* ${err?.message || 'Vérifiez que le service IA est démarré.'}`,
        timestamp: new Date().toISOString(),
      }
      updateChat(activeChatId, (c) => ({
        messages: [...c.messages, errorMsg],
        updatedAt: new Date().toISOString(),
      }))
    } finally {
      setIsTyping(false)
    }
  }, [input, activeChatId, isTyping, messages, updateChat, location, role, currentWorkspace])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // ── Render ──
  if (!isOpen) return null

  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        style={{ left: position.x !== null ? position.x : undefined, top: position.y !== null ? position.y : undefined }}
        className="fixed z-[9998] flex items-center gap-2 bg-gradient-to-r from-[#313ADF] to-[#040741] text-white px-4 py-2.5 rounded-full shadow-xl hover:shadow-2xl transition-all text-sm font-medium"
      >
        <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">N</span>
        <span>Neo IA</span>
        <span className="w-2 h-2 rounded-full bg-emerald-400" />
      </button>
    )
  }

  return (
    <div
      ref={windowRef}
      style={{
        left: position.x !== null ? position.x : 'auto',
        top: position.y !== null ? position.y : 'auto',
        right: position.x === null ? 24 : 'auto',
        bottom: position.y === null ? 24 : 'auto',
        width: size.width,
        height: size.height,
      }}
      className="fixed z-[9998] flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden select-none"
    >
      {/* ── Title bar (draggable) ── */}
      <div
        onMouseDown={startDrag}
        className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-[#313ADF] to-[#040741] cursor-move flex-shrink-0"
      >
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
          <span className="text-white text-sm font-bold">N</span>
        </div>

        {/* Title */}
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm leading-tight">Neo — Assistant IA</p>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-white/60 text-[10px]">En ligne · Propulsé par Ollama</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1">
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setShowSidebar(!showSidebar)}
            title="Conversations"
            className="p-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </button>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setIsMinimized(true)}
            title="Réduire"
            className="p-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setIsOpen(false)}
            title="Fermer"
            className="p-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0">
        {/* Conversations sidebar */}
        {showSidebar && (
          <ConversationSidebar
            chats={chats}
            activeChatId={activeChatId}
            onSelect={(id) => setActiveChatId(id)}
            onNew={createNewChat}
            onDelete={deleteChat}
          />
        )}

        {/* Chat area */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-8">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#313ADF] to-[#040741] flex items-center justify-center">
                  <span className="text-white text-2xl font-bold">N</span>
                </div>
                <p className="text-gray-500 text-sm">Posez votre première question à Neo</p>
              </div>
            )}
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {isTyping && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-gray-100 flex-shrink-0">
            <div className="flex gap-2 items-end">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message Neo… (Entrée pour envoyer)"
                rows={1}
                className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF] transition-all placeholder-gray-400 max-h-28 overflow-y-auto"
                style={{ minHeight: '40px' }}
                onInput={(e) => {
                  e.target.style.height = 'auto'
                  e.target.style.height = Math.min(e.target.scrollHeight, 112) + 'px'
                }}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isTyping}
                className="flex-shrink-0 w-10 h-10 bg-[#313ADF] text-white rounded-xl flex items-center justify-center hover:bg-[#2730c4] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isTyping ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-[10px] text-gray-400 text-center mt-1.5">
              Shift+Entrée pour nouvelle ligne
            </p>
          </div>
        </div>
      </div>

      {/* ── Resize handle ── */}
      <div
        onMouseDown={startResize}
        className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize flex items-center justify-center opacity-40 hover:opacity-70 transition-opacity"
        title="Redimensionner"
      >
        <svg className="w-3 h-3 text-gray-500" viewBox="0 0 6 6" fill="currentColor">
          <circle cx="5" cy="5" r="1" />
          <circle cx="3" cy="5" r="1" />
          <circle cx="5" cy="3" r="1" />
        </svg>
      </div>
    </div>
  )
}
