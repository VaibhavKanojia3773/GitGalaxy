import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, Send, X, Sparkles, Navigation } from 'lucide-react'
import useStore from '../store'

const SUGGESTIONS = [
  'Where is authentication?',
  'What are the biggest files?',
  'Show me the classes',
  'Overview and languages',
  'Show open issues',
]

function renderMarkdown(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#e2e8f0">$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(99,102,241,0.18);padding:1px 5px;border-radius:4px;font-family:monospace;font-size:10px;color:#a5b4fc">$1</code>')
    .replace(/\n/g, '<br/>')
}

function Message({ msg }) {
  const isUser = msg.role === 'user'
  const nodeMap          = useStore((s) => s.nodeMap)
  const setSelectedNode  = useStore((s) => s.setSelectedNode)
  const setCameraTarget  = useStore((s) => s.setCameraTarget)

  // referenced code nodes → clickable fly-to chips (dedup by display name)
  const refs = []
  if (!isUser && msg.node_ids?.length) {
    const seen = new Set()
    for (const id of msg.node_ids) {
      const n = nodeMap[id]
      if (!n) continue
      const label = n.name || n.title || (n.file_path || '').split('/').pop()
      if (!label || seen.has(label)) continue
      seen.add(label)
      refs.push({ node: n, label })
      if (refs.length >= 4) break
    }
  }

  function flyTo(n) {
    setSelectedNode(n)
    setCameraTarget({ x: n.x, y: n.y, z: n.z + 18, lookAt: { x: n.x, y: n.y, z: n.z } })
  }

  return (
    <div className={`flex gap-2 mb-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
          <Sparkles size={10} className="text-white" />
        </div>
      )}
      <div className="max-w-xs lg:max-w-md">
        <div
          className="px-3 py-2 rounded-2xl text-xs leading-relaxed"
          style={isUser ? {
            background: 'linear-gradient(135deg,rgba(99,102,241,0.85),rgba(139,92,246,0.75))',
            color: '#fff',
            borderBottomRightRadius: 4,
          } : {
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#cbd5e1',
            borderBottomLeftRadius: 4,
            wordBreak: 'break-word',
          }}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
        />
        {refs.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {refs.map(({ node, label }) => (
              <button
                key={node.id}
                onClick={() => flyTo(node)}
                title={node.file_path || ''}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono transition-all"
                style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', color: '#a5b4fc' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.25)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.1)' }}
              >
                <Navigation size={8} /> {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TypingDots() {
  return (
    <div className="flex gap-2 mb-3">
      <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
        style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
        <Sparkles size={10} className="text-white" />
      </div>
      <div className="px-3 py-2.5 rounded-2xl" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderBottomLeftRadius: 4 }}>
        <div className="flex gap-1 items-center">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
              style={{ background: '#818cf8', animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    </div>
  )
}

const glassBar = {
  background: 'rgba(8,10,20,0.88)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  borderTop: '1px solid rgba(255,255,255,0.07)',
}

export default function ChatPanel() {
  const repoUrl        = useStore((s) => s.repoUrl)
  const chatHistory    = useStore((s) => s.chatHistory)
  const setChatHistory = useStore((s) => s.setChatHistory)
  const setSearchResults = useStore((s) => s.setSearchResults)
  const setCameraTarget  = useStore((s) => s.setCameraTarget)
  const nodeMap        = useStore((s) => s.nodeMap)

  const [open, setOpen]       = useState(false)
  const [input, setInput]     = useState('')
  const [loading, setLoading] = useState(false)

  const messagesEndRef = useRef(null)
  const inputRef       = useRef(null)

  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory, open])

  function repoKey() {
    try {
      const parts = repoUrl.replace('https://github.com/', '').split('/')
      return `${parts[0]}/${parts[1]}`
    } catch { return repoUrl }
  }

  async function sendMessage(text) {
    if (!text.trim() || loading) return
    const query      = text.trim()
    setInput('')
    const userMsg    = { role: 'user', content: query }
    const newHistory = [...chatHistory, userMsg]
    setChatHistory(newHistory)
    setLoading(true)
    setOpen(true)

    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo:    repoKey(),
          query,
          history: newHistory.slice(-8).map((m) => ({ role: m.role, content: m.content })),
        }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ answer: 'Request failed.' }))
        setChatHistory([...newHistory, { role: 'assistant', content: err.detail || err.answer || 'Error.' }])
        return
      }
      const data = await resp.json()
      setChatHistory([...newHistory, { role: 'assistant', content: data.answer, node_ids: data.node_ids, action: data.action }])

      if (data.node_ids?.length) {
        setSearchResults(data.node_ids.map((id) => ({ node_id: id, score: 1 })))
        if (data.action === 'fly') {
          const top3 = data.node_ids.slice(0, 3)
          let cx = 0, cy = 0, cz = 0
          for (const id of top3) { const n = nodeMap[id]; if (n) { cx += n.x; cy += n.y; cz += n.z } }
          const count = top3.filter((id) => nodeMap[id]).length
          if (count > 0) setCameraTarget({ x: cx / count, y: cy / count, z: cz / count + 25, lookAt: { x: cx / count, y: cy / count, z: cz / count } })
        }
      }
    } catch (e) {
      setChatHistory([...newHistory, { role: 'assistant', content: `Network error: ${e.message}` }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30">
      <AnimatePresence>
        {open && (
          <motion.div
            key="drawer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 340 }}
            style={{ overflow: 'hidden', ...glassBar, borderTop: 'none' }}
          >
            {chatHistory.length === 0 ? (
              <div className="px-4 pt-3 pb-2">
                <p className="text-xs mb-2.5" style={{ color: '#475569' }}>Try asking:</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="px-3 py-1 text-xs rounded-full transition-all"
                      style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)', color: '#818cf8' }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="overflow-y-auto px-4 pt-3 pb-1" style={{ maxHeight: 260, scrollbarWidth: 'thin', scrollbarColor: 'rgba(99,102,241,0.2) transparent' }}>
                {chatHistory.map((msg, i) => <Message key={i} msg={msg} />)}
                {loading && <TypingDots />}
                <div ref={messagesEndRef} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* bottom bar */}
      <div style={glassBar} className="px-4 py-2">
        <form onSubmit={(e) => { e.preventDefault(); sendMessage(input) }} className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            className="flex items-center gap-1.5 shrink-0 text-xs transition-colors"
            style={{ color: open ? '#818cf8' : '#4b5563' }}
          >
            <MessageSquare size={14} />
            <span className="hidden sm:inline">Talk to Repo</span>
          </button>

          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder="Ask about this repo…"
            className="flex-1 text-xs text-white placeholder-gray-700 focus:outline-none min-w-0 rounded-lg px-3 py-1.5 transition-colors"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
          />

          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="shrink-0 p-1.5 rounded-lg transition-all"
            style={{
              background: input.trim() && !loading ? 'rgba(99,102,241,0.85)' : 'rgba(99,102,241,0.15)',
              opacity: !input.trim() || loading ? 0.5 : 1,
            }}
          >
            <Send size={12} className="text-white" />
          </button>

          {chatHistory.length > 0 && (
            <button type="button" onClick={() => setChatHistory([])} style={{ color: '#374151' }} title="Clear chat">
              <X size={13} />
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
