import { useState } from 'react'
import { X, ChevronDown, ChevronUp } from 'lucide-react'
import useStore from '../store'

const LANG_COLORS = {
  python: 'bg-blue-800 text-blue-200',
  javascript: 'bg-yellow-800 text-yellow-200',
  typescript: 'bg-blue-700 text-blue-100',
  java: 'bg-orange-800 text-orange-200',
  go: 'bg-cyan-800 text-cyan-200',
  default: 'bg-gray-700 text-gray-200',
}

function langBadge(lang) {
  return LANG_COLORS[lang] || LANG_COLORS.default
}

export default function NodePanel() {
  const selectedNode = useStore((s) => s.selectedNode)
  const setSelectedNode = useStore((s) => s.setSelectedNode)
  const graph = useStore((s) => s.graph)
  const nodeMap = useStore((s) => s.nodeMap)

  const [bodyExpanded, setBodyExpanded] = useState(false)
  const [agentText, setAgentText] = useState('')
  const [agentLoading, setAgentLoading] = useState(false)

  if (!selectedNode) return null

  const repoKey = graph?.metadata?.repo

  function getNearbyNodeIds(count = 10) {
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

  async function handleExplainCluster() {
    setAgentLoading(true)
    setAgentText('')
    const nearbyIds = getNearbyNodeIds(10)
    const ids = [selectedNode.id, ...nearbyIds]
    try {
      const resp = await fetch('/api/agent/cluster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_ids: ids, repo: repoKey }),
      })
      const data = await resp.json()
      setAgentText(data.explanation || '')
    } catch (err) {
      setAgentText('Error: ' + err.message)
    } finally {
      setAgentLoading(false)
    }
  }

  async function handleAnalyseIssue() {
    setAgentLoading(true)
    setAgentText('')
    const nearbyIds = getNearbyNodeIds(5)
    try {
      const resp = await fetch('/api/agent/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issue_id: selectedNode.id,
          repo: repoKey,
          nearby_node_ids: nearbyIds,
        }),
      })
      const data = await resp.json()
      setAgentText(data.explanation || '')
    } catch (err) {
      setAgentText('Error: ' + err.message)
    } finally {
      setAgentLoading(false)
    }
  }

  async function handleBlastRadius() {
    setAgentLoading(true)
    setAgentText('')
    const nearbyIds = getNearbyNodeIds(5)
    try {
      const resp = await fetch('/api/agent/search-explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: selectedNode.title || selectedNode.name,
          result_node_ids: nearbyIds,
          repo: repoKey,
        }),
      })
      const data = await resp.json()
      setAgentText(data.explanation || '')
    } catch (err) {
      setAgentText('Error: ' + err.message)
    } finally {
      setAgentLoading(false)
    }
  }

  const isCode = selectedNode.type === 'code'
  const isIssue = selectedNode.type === 'issue'
  const isPR = selectedNode.type === 'pr'

  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-gray-900/95 backdrop-blur-md border-l border-gray-800 z-20 flex flex-col overflow-hidden">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {isCode ? selectedNode.chunk_type : selectedNode.type}
        </span>
        <button
          onClick={() => setSelectedNode(null)}
          className="text-gray-500 hover:text-white transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isCode && (
          <>
            <div>
              <div className="text-xs text-gray-500 mb-1 truncate">{selectedNode.file_path}</div>
              <div className="text-white font-semibold text-sm">{selectedNode.name}</div>
              <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${langBadge(selectedNode.language)}`}>
                {selectedNode.language}
              </span>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Preview</div>
              <pre className="bg-gray-800 rounded p-2 text-xs text-gray-300 overflow-auto max-h-48 leading-relaxed">
                {selectedNode.content_preview}
              </pre>
            </div>
            <button
              onClick={handleExplainCluster}
              disabled={agentLoading}
              className="w-full py-2 bg-indigo-700 hover:bg-indigo-600 disabled:bg-gray-700 rounded-lg text-sm text-white transition-colors"
            >
              {agentLoading ? 'Thinking...' : 'Explain cluster nearby'}
            </button>
          </>
        )}

        {isIssue && (
          <>
            <div>
              <div className="text-xs text-orange-400 mb-1">Issue #{selectedNode.number}</div>
              <div className="text-white font-semibold text-sm">{selectedNode.title}</div>
              {selectedNode.labels?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {selectedNode.labels.map((lbl) => (
                    <span key={lbl} className="px-2 py-0.5 bg-gray-700 rounded-full text-xs text-gray-300">
                      {lbl}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {selectedNode.body && (
              <div>
                <div className="text-xs text-gray-400 mb-1">Description</div>
                <div className="text-sm text-gray-300">
                  {bodyExpanded ? selectedNode.body : selectedNode.body.slice(0, 300)}
                  {selectedNode.body.length > 300 && (
                    <button
                      onClick={() => setBodyExpanded((v) => !v)}
                      className="ml-1 text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-0.5"
                    >
                      {bodyExpanded ? <><ChevronUp size={12} /> less</> : <><ChevronDown size={12} /> more</>}
                    </button>
                  )}
                </div>
              </div>
            )}
            <button
              onClick={handleAnalyseIssue}
              disabled={agentLoading}
              className="w-full py-2 bg-orange-700 hover:bg-orange-600 disabled:bg-gray-700 rounded-lg text-sm text-white transition-colors"
            >
              {agentLoading ? 'Analysing...' : 'Analyse impact'}
            </button>
          </>
        )}

        {isPR && (
          <>
            <div>
              <div className="text-xs text-green-400 mb-1">PR #{selectedNode.number}</div>
              <div className="text-white font-semibold text-sm">{selectedNode.title}</div>
              <span className="inline-block mt-1 px-2 py-0.5 bg-green-900 text-green-300 rounded text-xs">
                {selectedNode.state}
              </span>
            </div>
            {selectedNode.body && (
              <div>
                <div className="text-xs text-gray-400 mb-1">Description</div>
                <div className="text-sm text-gray-300">{selectedNode.body.slice(0, 300)}</div>
              </div>
            )}
            <button
              onClick={handleBlastRadius}
              disabled={agentLoading}
              className="w-full py-2 bg-green-700 hover:bg-green-600 disabled:bg-gray-700 rounded-lg text-sm text-white transition-colors"
            >
              {agentLoading ? 'Analysing...' : 'Analyse blast radius'}
            </button>
          </>
        )}

        {agentText && (
          <div className="p-3 bg-gray-800 rounded-lg text-xs text-gray-300 leading-relaxed whitespace-pre-line border border-gray-700">
            {agentText}
          </div>
        )}
      </div>
    </div>
  )
}
