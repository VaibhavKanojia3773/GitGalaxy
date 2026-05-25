import { useState, useEffect, useRef } from 'react'
import { Search, Sparkles, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import useStore from '../store'

export default function SearchBar() {
  const [query, setQuery]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [agentText, setAgentText] = useState('')
  const [agentLoading, setAgentLoading] = useState(false)
  const [focused, setFocused]     = useState(false)
  const inputRef = useRef(null)

  const graph          = useStore((s) => s.graph)
  const nodeMap        = useStore((s) => s.nodeMap)
  const searchResults  = useStore((s) => s.searchResults)
  const setSearchResults = useStore((s) => s.setSearchResults)
  const setCameraTarget  = useStore((s) => s.setCameraTarget)
  const repoKey = graph?.metadata?.repo

  // Cmd/Ctrl+K to focus
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  async function handleSearch(e) {
    e.preventDefault()
    if (!query.trim() || !repoKey) return
    setLoading(true)
    setAgentText('')
    try {
      const resp = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: repoKey, query }),
      })
      const data = await resp.json()
      const results = data.results || []
      setSearchResults(results)
      const top3 = results.slice(0, 3).map((r) => nodeMap[r.node_id]).filter(Boolean)
      if (top3.length) {
        const cx = top3.reduce((s, n) => s + n.x, 0) / top3.length
        const cy = top3.reduce((s, n) => s + n.y, 0) / top3.length
        const cz = top3.reduce((s, n) => s + n.z, 0) / top3.length
        setCameraTarget({ x: cx, y: cy, z: cz + 20 })
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleExplain() {
    if (!searchResults.length || !repoKey) return
    setAgentLoading(true)
    try {
      const resp = await fetch('/api/agent/search-explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          result_node_ids: searchResults.slice(0, 5).map((r) => r.node_id),
          repo: repoKey,
        }),
      })
      const data = await resp.json()
      setAgentText(data.explanation || '')
    } catch (err) {
      setAgentText('Agent error: ' + err.message)
    } finally {
      setAgentLoading(false)
    }
  }

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-20 w-full max-w-lg px-4">
      <motion.div
        animate={{ boxShadow: focused ? '0 0 0 1px rgba(99,102,241,0.5), 0 20px 60px rgba(0,0,0,0.6)' : '0 8px 32px rgba(0,0,0,0.4)' }}
        transition={{ duration: 0.2 }}
        style={{
          background: 'rgba(15,17,26,0.75)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: focused ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.07)',
          borderRadius: '16px',
          padding: '10px 12px',
        }}
      >
        <form onSubmit={handleSearch} className="flex gap-2 items-center">
          <Search size={15} className={`shrink-0 transition-colors ${focused ? 'text-indigo-400' : 'text-gray-500'}`} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Search code… (⌘K)"
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 focus:outline-none"
          />
          {query && (
            <button type="button" onClick={() => { setQuery(''); setSearchResults([]) }} className="text-gray-600 hover:text-gray-400">
              <X size={13} />
            </button>
          )}
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-3 py-1.5 text-xs font-medium rounded-lg transition-all"
            style={{ background: loading ? 'rgba(79,70,229,0.3)' : 'rgba(99,102,241,0.9)', color: '#fff' }}
          >
            {loading ? '…' : 'Go'}
          </button>
        </form>

        <AnimatePresence>
          {searchResults.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2 pt-2 overflow-hidden"
              style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: 'rgba(148,163,184,0.8)' }}>
                  {searchResults.length} matches
                </span>
                <button
                  onClick={handleExplain}
                  disabled={agentLoading}
                  className="flex items-center gap-1 text-xs transition-colors"
                  style={{ color: agentLoading ? '#4b5563' : '#818cf8' }}
                >
                  <Sparkles size={11} />
                  {agentLoading ? 'Thinking…' : 'AI explain'}
                </button>
              </div>
              {agentText && (
                <p className="mt-2 text-xs leading-relaxed whitespace-pre-line" style={{ color: '#cbd5e1' }}>
                  {agentText}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
