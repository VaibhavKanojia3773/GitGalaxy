import useStore from '../store'

const NODE_TYPES = [
  { label: 'Function', color: '#818cf8' },
  { label: 'Class', color: '#34d399' },
  { label: 'File', color: '#94a3b8' },
  { label: 'Issue', color: '#fb923c' },
  { label: 'PR', color: '#4ade80' },
]

export default function Legend() {
  const graph = useStore((s) => s.graph)
  const meta = graph?.metadata

  return (
    <div className="fixed bottom-4 left-4 z-20 bg-gray-900/80 backdrop-blur-md border border-gray-700 rounded-xl p-3 text-xs">
      <div className="text-gray-300 font-semibold mb-2">GitGalaxy</div>

      <div className="space-y-1 mb-3">
        {NODE_TYPES.map(({ label, color }) => (
          <div key={label} className="flex items-center gap-2 text-gray-400">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div className="space-y-1 mb-3 border-t border-gray-700 pt-2">
        <div className="flex items-center gap-2 text-gray-400">
          <div className="w-4 h-px bg-gray-500 shrink-0" />
          <span>Structural</span>
        </div>
        <div className="flex items-center gap-2 text-gray-400">
          <div className="w-4 h-px bg-indigo-600 shrink-0" style={{ borderTop: '1px dashed #4f46e5' }} />
          <span>Semantic</span>
        </div>
      </div>

      {meta && (
        <div className="border-t border-gray-700 pt-2 text-gray-500 space-y-0.5">
          <div>{meta.total_nodes ?? 0} nodes · {meta.total_edges ?? 0} edges</div>
          <div>{meta.total_files ?? 0} files · {meta.open_issues ?? 0} issues</div>
        </div>
      )}
    </div>
  )
}
