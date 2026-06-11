import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GitBranch, Zap, Search, MessageSquare, ArrowRight, Star } from 'lucide-react'
import useStore from '../store'
import { useGraphData } from '../hooks/useGraphData'
import ProviderSetup from './ProviderSetup'

const EXAMPLES = [
  { label: 'realpython/codetiming', url: 'https://github.com/realpython/codetiming' },
  { label: 'psf/requests', url: 'https://github.com/psf/requests' },
  { label: 'pallets/flask', url: 'https://github.com/pallets/flask' },
]

const FEATURES = [
  { icon: <Zap size={16} />, title: 'Instant 3D Map', desc: 'Any public repo becomes a navigable galaxy in under 2 minutes' },
  { icon: <Search size={16} />, title: 'Semantic Search', desc: 'Find functions and files by meaning, not just name — powered by FAISS + BM25' },
  { icon: <MessageSquare size={16} />, title: 'Talk to the Codebase', desc: 'Ask plain-English questions and fly the camera to the answer' },
  { icon: <GitBranch size={16} />, title: 'Issues & PRs', desc: 'Open issues and pull requests rendered as nodes alongside the code' },
]

export default function RepoInput() {
  const [input, setInput]   = useState('')
  const [focused, setFocused] = useState(false)
  const setRepoUrl  = useStore((s) => s.setRepoUrl)
  const provider    = useStore((s) => s.provider)
  const apiKey      = useStore((s) => s.apiKey)
  const setProvider = useStore((s) => s.setProvider)
  const { loadRepo } = useGraphData()

  function handleSubmit(e) {
    e.preventDefault()
    const url = input.trim()
    if (!url) return
    setRepoUrl(url)
    loadRepo(url)
  }

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col items-center justify-center overflow-y-auto py-24"
      style={{
        background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(99,102,241,0.16) 0%, transparent 60%), rgba(2,6,23,0.55)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
      }}
    >
      {/* top nav */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }} />
          <span className="font-bold text-white text-sm tracking-tight">GitGalaxy</span>
        </div>
        <a
          href="https://github.com/VaibhavKanojia3773/GitGalaxy"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-all"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}
        >
          <Star size={11} /> GitHub
        </a>
      </div>

      {/* hero */}
      <motion.div
        className="flex flex-col items-center text-center px-6 w-full max-w-2xl z-10"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        {/* badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="mb-5 px-3 py-1 rounded-full text-xs font-medium"
          style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: '#a5b4fc' }}
        >
          Visualize · Search · Chat — any public repository
        </motion.div>

        <h1 className="font-display text-5xl sm:text-6xl font-bold leading-none tracking-tight mb-4"
          style={{ background: 'linear-gradient(135deg, #e2e8f0 0%, #a5b4fc 40%, #818cf8 70%, #c084fc 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
          Explore code as<br />a living galaxy
        </h1>

        <p className="text-base mb-10 max-w-md leading-relaxed" style={{ color: '#64748b' }}>
          Paste any public GitHub URL. GitGalaxy maps the codebase into a 3D semantic universe — then lets you search and chat with it.
        </p>

        {/* input form */}
        <motion.form
          onSubmit={handleSubmit}
          className="w-full max-w-xl"
          animate={{ boxShadow: focused ? '0 0 0 1px rgba(99,102,241,0.5), 0 20px 60px rgba(99,102,241,0.15)' : '0 8px 40px rgba(0,0,0,0.5)' }}
          transition={{ duration: 0.2 }}
          style={{
            background: 'rgba(15,17,26,0.8)',
            backdropFilter: 'blur(20px)',
            border: focused ? '1px solid rgba(99,102,241,0.45)' : '1px solid rgba(255,255,255,0.08)',
            borderRadius: 16,
            padding: '6px 6px 6px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <GitBranch size={15} style={{ color: focused ? '#818cf8' : '#374151', flexShrink: 0, transition: 'color 0.2s' }} />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="https://github.com/owner/repo"
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-700 focus:outline-none"
            style={{ minWidth: 0 }}
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shrink-0"
            style={{
              background: input.trim() ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'rgba(99,102,241,0.2)',
              color: input.trim() ? '#fff' : '#4b5563',
              boxShadow: input.trim() ? '0 4px 20px rgba(99,102,241,0.35)' : 'none',
            }}
          >
            Launch <ArrowRight size={14} />
          </button>
        </motion.form>

        {/* quick examples */}
        <div className="flex items-center gap-2 mt-4 flex-wrap justify-center">
          <span className="text-xs" style={{ color: '#334155' }}>Try:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              onClick={() => setInput(ex.url)}
              className="text-xs px-2.5 py-1 rounded-full transition-all"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#475569' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#818cf8'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#475569'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
            >
              {ex.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* feature grid */}
      <motion.div
        className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-16 px-6 w-full max-w-2xl z-10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.5 }}
      >
        {FEATURES.map(({ icon, title, desc }) => (
          <div
            key={title}
            className="rounded-2xl p-4"
            style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="mb-2 p-1.5 rounded-lg inline-flex" style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>
              {icon}
            </div>
            <p className="text-xs font-semibold text-white mb-1">{title}</p>
            <p className="text-xs leading-relaxed" style={{ color: '#475569' }}>{desc}</p>
          </div>
        ))}
      </motion.div>

      {/* provider setup — collapsible */}
      <motion.div
        className="mt-8 w-full max-w-xl px-6 z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <ProviderSetup provider={provider} apiKey={apiKey} onChange={setProvider} />
      </motion.div>

      {/* footer */}
      <p className="absolute bottom-5 text-xs" style={{ color: '#334155' }}>
        Open source · No data stored · Works on any public repo
      </p>
    </div>
  )
}
