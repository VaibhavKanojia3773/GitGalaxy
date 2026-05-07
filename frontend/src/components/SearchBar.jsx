import { useState } from 'react'
import { Search } from 'lucide-react'
import useStore from '../store'

export default function SearchBar() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [agentText, setAgentText] = useState('')
  const [agentLoading, setAgentLoading] = useState(false)

  const graph = useStore((s) => s.graph)
  const nodeMap = useStore((s) => s.nodeMap)
  const searchResults = useStore((s) => s.searchResults)
  const setSearchResults = useStore((s) => s.setSearchResults)
  const setCameraTarget = useStore((s) => s.setCameraTarget)

  const repoKey = graph?.metadata?.repo

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

      // fly camera to centroid of top-3
      const top3 = results.slice(0, 3)
        .map((r) => nodeMap[r.node_id])
        .filter(Boolean)
      if (top3.length) {
        const cx = top3.reduce((s, n) => s + n.x, 0) / top3.length
        const cy = top3.reduce((s, n) => s + n.y, 0) / top3.length
        const cz = top3.reduce((s, n) => s + n.z, 0) / top3.length
        setCameraTarget({ x: cx, y: cy, z: cz + 20 })
      }
    } catch (err) {
      console.error('Search error:', err)
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
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-20 w-full max-w-md px-4">
      <div className="bg-gray-900/80 backdrop-blur-md border border-gray-700 rounded-xl shadow-2xl p-3">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 bg-gray-800 rounded-lg px-3">
            <Search size={14} className="text-gray-400 shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search code semantically..."
              className="flex-1 bg-transparent py-2 text-sm text-white placeholder-gray-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 rounded-lg text-sm text-white transition-colors"
          >
            {loading ? '...' : 'Go'}
          </button>
        </form>

        {searchResults.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-700 flex items-center justify-between gap-2">
            <span className="text-xs text-gray-400">{searchResults.length} matches found</span>
            <button
              onClick={handleExplain}
              disabled={agentLoading}
              className="text-xs text-indigo-400 hover:text-indigo-300 disabled:text-gray-600 transition-colors"
            >
              {agentLoading ? 'Explaining...' : 'Explain results'}
            </button>
          </div>
        )}

        {agentText && (
          <div className="mt-2 pt-2 border-t border-gray-700 text-xs text-gray-300 whitespace-pre-line leading-relaxed">
            {agentText}
          </div>
        )}
      </div>
    </div>
  )
}
