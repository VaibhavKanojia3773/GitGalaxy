import { useState } from 'react'
import { motion } from 'framer-motion'
import { X, ChevronDown, ChevronUp, Code, AlertCircle, GitPullRequest, Cpu } from 'lucide-react'
import useStore from '../store'

const LANG_COLORS = {
  python:     { bg: 'rgba(129,140,248,0.15)', text: '#a5b4fc', border: 'rgba(129,140,248,0.3)' },
  javascript: { bg: 'rgba(251,191,36,0.12)',  text: '#fcd34d', border: 'rgba(251,191,36,0.3)'  },
  typescript: { bg: 'rgba(56,189,248,0.12)',  text: '#7dd3fc', border: 'rgba(56,189,248,0.3)'  },
  java:       { bg: 'rgba(251,146,60,0.12)',  text: '#fdba74', border: 'rgba(251,146,60,0.3)'  },
  go:         { bg: 'rgba(52,211,153,0.12)',  text: '#6ee7b7', border: 'rgba(52,211,153,0.3)'  },
}
const defaultBadge = { bg: 'rgba(148,163,184,0.1)', text: '#94a3b8', border: 'rgba(148,163,184,0.2)' }

function LangBadge({ lang }) {
  const s = LANG_COLORS[lang] || defaultBadge
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium"
      style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}>
      {lang}
    </span>
  )
}

function CodeBlock({ code }) {
  if (!code) return null
  const highlighted = code
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/(["'`])((?:\\.|(?!\1)[^\\])*?)\1/g, '<span style="color:#86efac">$1$2$1</span>')
    .replace(/\b(def|class|return|import|from|if|else|elif|for|while|async|await|const|let|var|function|export|default|type|interface|extends|new|this|try|catch|finally|throw|in|of|and|or|not|True|False|None|null|undefined|true|false)\b/g,
      '<span style="color:#c084fc">$1</span>')
    .replace(/(#[^\n]*)$/gm, '<span style="color:#4b5563">$1</span>')
    .replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#fbbf24">$1</span>')
    .replace(/\b([a-zA-Z_]\w*)\s*(?=\()/g, '<span style="color:#67e8f9">$1</span>')

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-1.5 px-3 py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}>
        <div className="w-2 h-2 rounded-full" style={{ background: '#ef4444', opacity: 0.6 }} />
        <div className="w-2 h-2 rounded-full" style={{ background: '#eab308', opacity: 0.6 }} />
        <div className="w-2 h-2 rounded-full" style={{ background: '#22c55e', opacity: 0.6 }} />
        <span className="ml-2 text-xs" style={{ color: '#374151' }}>preview</span>
      </div>
      <pre
        className="p-3 overflow-auto"
        style={{ maxHeight: 180, color: '#e2e8f0', fontFamily: '"JetBrains Mono","Fira Code",monospace', fontSize: 11, lineHeight: 1.6 }}
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </div>
  )
}

function AgentResult({ text }) {
  if (!text) return null
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl p-3 text-xs leading-relaxed whitespace-pre-line"
      style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', color: '#cbd5e1' }}
    >
      {text}
    </motion.div>
  )
}

export default function NodePanel() {
  const selectedNode    = useStore((s) => s.selectedNode)
  const setSelectedNode = useStore((s) => s.setSelectedNode)
  const graph           = useStore((s) => s.graph)

  const [bodyExpanded, setBodyExpanded] = useState(false)
  const [agentText, setAgentText]       = useState('')
  const [agentLoading, setAgentLoading] = useState(false)

  if (!selectedNode) return null

  const repoKey = graph?.metadata?.repo

  function getNearbyIds(count = 10) {
    if (!graph?.nodes) return []
    return graph.nodes
      .filter((n) => n.id !== selectedNode.id && n.type === 'code')
      .sort((a, b) => {
        const da = Math.hypot(a.x - selectedNode.x, a.y - selectedNode.y, a.z - selectedNode.z)
        const db = Math.hypot(b.x - selectedNode.x, b.y - selectedNode.y, b.z - selectedNode.z)
        return da - db
      })
      .slice(0, count)
      .map((n) => n.id)
  }

  async function callAgent(url, body) {
    setAgentLoading(true)
    setAgentText('')
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, repo: repoKey }),
      })
      const data = await resp.json()
      setAgentText(data.explanation || '')
    } catch (err) {
      setAgentText('Error: ' + err.message)
    } finally {
      setAgentLoading(false)
    }
  }

  const isCode  = selectedNode.type === 'code'
  const isIssue = selectedNode.type === 'issue'
  const isPR    = selectedNode.type === 'pr'

  return (
    <motion.div
      className="fixed right-0 top-0 h-full z-20 flex flex-col overflow-hidden"
      style={{
        width: 320,
        background: 'rgba(8,10,18,0.85)',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
        borderLeft: '1px solid rgba(255,255,255,0.07)',
      }}
      initial={{ x: 320, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 320, opacity: 0 }}
      transition={{ type: 'spring', damping: 30, stiffness: 320 }}
    >
      {/* header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2">
          {isCode && <Code size={13} className="text-indigo-400" />}
          {isIssue && <AlertCircle size={13} className="text-amber-400" />}
          {isPR && <GitPullRequest size={13} className="text-emerald-400" />}
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>
            {isCode ? (selectedNode.chunk_type || 'code') : selectedNode.type}
          </span>
        </div>
        <button
          onClick={() => setSelectedNode(null)}
          className="p-1 rounded-lg transition-colors"
          style={{ color: '#475569' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(99,102,241,0.25) transparent' }}>

        {/* ─ Code node ─ */}
        {isCode && (
          <>
            <div>
              <p className="text-xs mb-1 truncate" style={{ color: '#475569' }}>{selectedNode.file_path}</p>
              <p className="font-semibold text-sm text-white mb-2">{selectedNode.name}</p>
              <LangBadge lang={selectedNode.language} />
            </div>
            <CodeBlock code={selectedNode.content_preview} />
            <button
              onClick={() => callAgent('/api/agent/cluster', { node_ids: [selectedNode.id, ...getNearbyIds(10)] })}
              disabled={agentLoading}
              className="w-full py-2.5 text-sm font-medium rounded-xl transition-all flex items-center justify-center gap-2"
              style={{
                background: 'rgba(99,102,241,0.15)',
                border: '1px solid rgba(99,102,241,0.25)',
                color: '#a5b4fc',
              }}
            >
              <Cpu size={13} />
              {agentLoading ? 'Thinking…' : 'Explain cluster'}
            </button>
          </>
        )}

        {/* ─ Issue node ─ */}
        {isIssue && (
          <>
            <div>
              <p className="text-xs mb-1" style={{ color: '#f59e0b' }}>Issue #{selectedNode.number}</p>
              <p className="font-semibold text-sm text-white">{selectedNode.title}</p>
              {selectedNode.labels?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {selectedNode.labels.map((lbl) => (
                    <span key={lbl} className="px-2 py-0.5 text-xs rounded-full"
                      style={{ background: 'rgba(251,191,36,0.1)', color: '#fcd34d', border: '1px solid rgba(251,191,36,0.2)' }}>
                      {lbl}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {selectedNode.body && (
              <div>
                <p className="text-xs mb-1" style={{ color: '#475569' }}>Description</p>
                <p className="text-sm leading-relaxed" style={{ color: '#94a3b8' }}>
                  {bodyExpanded ? selectedNode.body : selectedNode.body.slice(0, 280)}
                  {selectedNode.body.length > 280 && (
                    <button onClick={() => setBodyExpanded(v => !v)} className="ml-1 inline-flex items-center gap-0.5" style={{ color: '#818cf8' }}>
                      {bodyExpanded ? <><ChevronUp size={11} /> less</> : <><ChevronDown size={11} /> more</>}
                    </button>
                  )}
                </p>
              </div>
            )}
            <button
              onClick={() => callAgent('/api/agent/issue', { issue_id: selectedNode.id, nearby_node_ids: getNearbyIds(5) })}
              disabled={agentLoading}
              className="w-full py-2.5 text-sm font-medium rounded-xl transition-all flex items-center justify-center gap-2"
              style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.25)', color: '#fcd34d' }}
            >
              <AlertCircle size={13} />
              {agentLoading ? 'Analysing…' : 'Analyse impact'}
            </button>
          </>
        )}

        {/* ─ PR node ─ */}
        {isPR && (
          <>
            <div>
              <p className="text-xs mb-1" style={{ color: '#4ade80' }}>PR #{selectedNode.number}</p>
              <p className="font-semibold text-sm text-white">{selectedNode.title}</p>
              <span className="inline-block mt-1.5 px-2 py-0.5 text-xs rounded-full"
                style={{ background: 'rgba(74,222,128,0.12)', color: '#86efac', border: '1px solid rgba(74,222,128,0.25)' }}>
                {selectedNode.state}
              </span>
            </div>
            {selectedNode.body && (
              <p className="text-sm leading-relaxed" style={{ color: '#94a3b8' }}>{selectedNode.body.slice(0, 280)}</p>
            )}
            <button
              onClick={() => callAgent('/api/agent/search-explain', { query: selectedNode.title, result_node_ids: getNearbyIds(5) })}
              disabled={agentLoading}
              className="w-full py-2.5 text-sm font-medium rounded-xl transition-all flex items-center justify-center gap-2"
              style={{ background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.25)', color: '#86efac' }}
            >
              <GitPullRequest size={13} />
              {agentLoading ? 'Analysing…' : 'Analyse blast radius'}
            </button>
          </>
        )}

        <AgentResult text={agentText} />
      </div>
    </motion.div>
  )
}
