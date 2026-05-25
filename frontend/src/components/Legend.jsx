import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import useStore from '../store'

const LANG_COLORS = {
  python: '#818cf8', javascript: '#fbbf24', typescript: '#38bdf8',
  java: '#fb923c', go: '#34d399', unknown: '#94a3b8',
}

const NODE_TYPES = [
  { label: 'File Planet',     color: '#94a3b8', dot: true },
  { label: 'Function',        color: '#a5b4fc', dot: true },
  { label: 'Class',           color: '#6ee7b7', dot: true },
  { label: 'Issue',           color: '#fbbf24', dot: true },
  { label: 'Pull Request',    color: '#4ade80', dot: true },
]

const LANGS = [
  { label: 'Python',     color: '#818cf8' },
  { label: 'JavaScript', color: '#fbbf24' },
  { label: 'TypeScript', color: '#38bdf8' },
  { label: 'Go',         color: '#34d399' },
  { label: 'Java',       color: '#fb923c' },
]

const glass = {
  background: 'rgba(10,12,20,0.72)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: '14px',
}

export default function Legend() {
  const graph = useStore((s) => s.graph)
  const meta  = graph?.metadata
  const [open, setOpen] = useState(true)

  return (
    <div className="fixed bottom-16 left-4 z-20 text-xs" style={{ minWidth: 170 }}>
      <div style={glass} className="overflow-hidden">
        {/* header */}
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center justify-between px-3 py-2.5"
        >
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
            <span className="font-semibold" style={{ color: '#e2e8f0', letterSpacing: '0.03em' }}>
              GitGalaxy
            </span>
          </div>
          {open ? <ChevronDown size={12} className="text-gray-500" /> : <ChevronUp size={12} className="text-gray-500" />}
        </button>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              style={{ overflow: 'hidden', borderTop: '1px solid rgba(255,255,255,0.05)' }}
            >
              <div className="px-3 py-2.5 space-y-3">
                {/* node types */}
                <div>
                  <p className="text-gray-600 uppercase tracking-widest text-[10px] mb-1.5">Nodes</p>
                  <div className="space-y-1.5">
                    {NODE_TYPES.map(({ label, color }) => (
                      <div key={label} className="flex items-center gap-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: color, boxShadow: `0 0 5px ${color}99` }}
                        />
                        <span style={{ color: '#94a3b8' }}>{label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* edges */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8 }}>
                  <p className="text-gray-600 uppercase tracking-widest text-[10px] mb-1.5">Edges</p>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-5 shrink-0" style={{ height: 1, background: '#3b4f6e' }} />
                      <span style={{ color: '#94a3b8' }}>Structural</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-5 shrink-0" style={{ height: 1, borderTop: '1px dashed #6366f1' }} />
                      <span style={{ color: '#94a3b8' }}>Semantic</span>
                    </div>
                  </div>
                </div>

                {/* languages */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8 }}>
                  <p className="text-gray-600 uppercase tracking-widest text-[10px] mb-1.5">Languages</p>
                  <div className="flex flex-wrap gap-1.5">
                    {LANGS.map(({ label, color }) => (
                      <div key={label} className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                        <span style={{ color: '#64748b' }}>{label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* repo stats */}
                {meta && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8 }} className="space-y-0.5">
                    <div style={{ color: '#475569' }}>{meta.total_nodes ?? 0} nodes · {meta.total_edges ?? 0} edges</div>
                    <div style={{ color: '#475569' }}>{meta.total_files ?? 0} files · {meta.open_issues ?? 0} issues</div>
                    {meta.repo && <div className="truncate" style={{ color: '#334155' }}>{meta.repo}</div>}
                  </div>
                )}

                {/* keyboard hint */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8, color: '#334155' }}>
                  Click planet to expand · Esc to collapse
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
