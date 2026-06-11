import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Telescope, X, Navigation, Play, ChevronLeft, ChevronRight, Square, Folder, Share2 } from 'lucide-react'
import useStore from '../store'

const glass = {
  background: 'rgba(15,17,26,0.78)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.07)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
}

export default function InsightsPanel() {
  const graph           = useStore((s) => s.graph)
  const setCameraTarget = useStore((s) => s.setCameraTarget)
  const setExpandedFile = useStore((s) => s.setExpandedFile)
  const setSelectedNode = useStore((s) => s.setSelectedNode)

  const [open, setOpen] = useState(false)
  const [tourIdx, setTourIdx] = useState(-1) // -1 = no tour running

  // file-level hubs: aggregate edge counts per file, centroid per file
  const { hubs, folders } = useMemo(() => {
    if (!graph?.nodes) return { hubs: [], folders: [] }

    const nodeFile = {}
    const fileAgg = {} // file_path → { conns, nodes: [..] }
    for (const n of graph.nodes) {
      if (n.type !== 'code') continue
      nodeFile[n.id] = n.file_path
      const agg = (fileAgg[n.file_path] ??= { conns: 0, xs: 0, ys: 0, zs: 0, count: 0, repNode: n })
      agg.xs += n.x; agg.ys += n.y; agg.zs += n.z; agg.count++
      if (n.chunk_type === 'file') agg.repNode = n
    }
    for (const e of graph.edges || []) {
      const sf = nodeFile[e.source], tf = nodeFile[e.target]
      if (sf) fileAgg[sf].conns++
      if (tf) fileAgg[tf].conns++
    }

    const hubs = Object.entries(fileAgg)
      .map(([file_path, a]) => ({
        file_path,
        name: file_path.split('/').pop(),
        conns: a.conns,
        chunks: a.count,
        x: a.xs / a.count, y: a.ys / a.count, z: a.zs / a.count,
        repNode: a.repNode,
      }))
      .sort((a, b) => b.conns - a.conns)
      .slice(0, 6)

    const folderCount = {}
    for (const fp of Object.keys(fileAgg)) {
      const folder = fp.includes('/') ? fp.split('/')[0] : '(root)'
      folderCount[folder] = (folderCount[folder] || 0) + 1
    }
    const folders = Object.entries(folderCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)

    return { hubs, folders }
  }, [graph])

  function flyToHub(hub) {
    setExpandedFile(hub.file_path)
    setSelectedNode(hub.repNode)
    setCameraTarget({ x: hub.x, y: hub.y, z: hub.z + 28, lookAt: { x: hub.x, y: hub.y, z: hub.z } })
  }

  function startTour() {
    if (!hubs.length) return
    setOpen(false)
    setTourIdx(0)
    flyToHub(hubs[0])
  }

  function tourStep(dir) {
    const next = tourIdx + dir
    if (next < 0 || next >= hubs.length) return
    setTourIdx(next)
    flyToHub(hubs[next])
  }

  function endTour() {
    setTourIdx(-1)
    setExpandedFile(null)
  }

  if (!graph) return null

  return (
    <>
      {/* toggle button — top right */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed top-4 right-4 z-20 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-all"
        style={{ ...glass, color: open ? '#a5b4fc' : '#94a3b8' }}
      >
        <Telescope size={13} /> Insights
      </button>

      {/* insights panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="fixed top-16 right-4 z-20 rounded-2xl p-4 w-72"
            style={glass}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-white font-display tracking-wide">Repository Insights</span>
              <button onClick={() => setOpen(false)} style={{ color: '#475569' }}><X size={13} /></button>
            </div>

            <button
              onClick={startTour}
              className="w-full flex items-center justify-center gap-2 py-2 mb-4 rounded-xl text-xs font-semibold transition-all"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', boxShadow: '0 4px 16px rgba(99,102,241,0.3)' }}
            >
              <Play size={12} /> Guided tour of core files
            </button>

            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider mb-2" style={{ color: '#475569' }}>
              <Share2 size={10} /> Most connected files
            </p>
            <div className="flex flex-col gap-1 mb-4">
              {hubs.map((h) => (
                <button
                  key={h.file_path}
                  onClick={() => flyToHub(h)}
                  title={h.file_path}
                  className="flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition-all group"
                  style={{ background: 'rgba(255,255,255,0.025)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.12)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.025)' }}
                >
                  <span className="text-[11px] font-mono truncate" style={{ color: '#cbd5e1' }}>{h.name}</span>
                  <span className="flex items-center gap-1 text-[10px] shrink-0 ml-2" style={{ color: '#64748b' }}>
                    {h.conns} <Navigation size={8} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#818cf8' }} />
                  </span>
                </button>
              ))}
            </div>

            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider mb-2" style={{ color: '#475569' }}>
              <Folder size={10} /> Top folders
            </p>
            <div className="flex flex-wrap gap-1.5">
              {folders.map(([name, count]) => (
                <span key={name} className="px-2 py-0.5 rounded-full text-[10px] font-mono"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#94a3b8' }}>
                  {name} · {count}
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* tour HUD — bottom center, above chat bar */}
      <AnimatePresence>
        {tourIdx >= 0 && hubs[tourIdx] && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed left-1/2 -translate-x-1/2 z-30 rounded-2xl px-4 py-3 flex items-center gap-3"
            style={{ ...glass, bottom: 64 }}
          >
            <button onClick={() => tourStep(-1)} disabled={tourIdx === 0}
              style={{ color: tourIdx === 0 ? '#334155' : '#94a3b8' }}>
              <ChevronLeft size={16} />
            </button>
            <div className="text-center" style={{ minWidth: 180 }}>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: '#64748b' }}>
                Core file {tourIdx + 1} of {hubs.length}
              </p>
              <p className="text-xs font-mono font-semibold text-white truncate" style={{ maxWidth: 220 }}>
                {hubs[tourIdx].file_path}
              </p>
              <p className="text-[10px]" style={{ color: '#818cf8' }}>
                {hubs[tourIdx].conns} connections · {hubs[tourIdx].chunks} chunks
              </p>
            </div>
            <button onClick={() => tourStep(1)} disabled={tourIdx === hubs.length - 1}
              style={{ color: tourIdx === hubs.length - 1 ? '#334155' : '#94a3b8' }}>
              <ChevronRight size={16} />
            </button>
            <button onClick={endTour} title="End tour"
              className="ml-1 p-1.5 rounded-lg"
              style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}>
              <Square size={11} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
