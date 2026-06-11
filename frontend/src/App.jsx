import { Suspense } from 'react'
import { AnimatePresence } from 'framer-motion'
import useStore from './store'
import RepoInput from './components/RepoInput'
import LoadingOverlay from './components/LoadingOverlay'
import Scene from './components/Scene'
import SearchBar from './components/SearchBar'
import NodePanel from './components/NodePanel'
import Legend from './components/Legend'
import ChatPanel from './components/ChatPanel'
import RepoHeader from './components/RepoHeader'

export default function App() {
  const repoStatus  = useStore((s) => s.repoStatus)
  const repoError   = useStore((s) => s.repoError)
  const selectedNode = useStore((s) => s.selectedNode)
  const setRepoStatus = useStore((s) => s.setRepoStatus)
  const setRepoUrl  = useStore((s) => s.setRepoUrl)

  if (repoStatus === 'idle') {
    return <RepoInput />
  }

  if (repoStatus === 'loading') {
    return (
      <div className="relative w-screen overflow-hidden" style={{ height: '100vh' }}>
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
        <LoadingOverlay />
      </div>
    )
  }

  if (repoStatus === 'error') {
    const isBackendDown = repoError && (
      repoError.includes('ECONNREFUSED') ||
      repoError.includes('Failed to fetch') ||
      repoError.includes('Network') ||
      repoError.includes('502') ||
      repoError.includes('500')
    )
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-white gap-6"
           style={{ background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(99,102,241,0.12) 0%, transparent 60%), #020617' }}>
        <div className="w-12 h-12 rounded-full flex items-center justify-center mb-2"
             style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <span style={{ fontSize: 22 }}>⚠</span>
        </div>
        <div className="text-red-400 text-xl font-semibold">Failed to load repository</div>
        <div className="text-gray-400 text-sm max-w-md text-center leading-relaxed">{repoError}</div>

        {isBackendDown && (
          <div className="max-w-sm w-full rounded-2xl p-5 text-sm"
               style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p className="text-amber-400 font-semibold mb-2">Backend not running</p>
            <p className="text-gray-400 mb-3">Start the FastAPI server in a new terminal:</p>
            <div className="rounded-lg px-3 py-2 font-mono text-xs text-green-400"
                 style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)' }}>
              cd gitgalaxy/backend<br />
              uvicorn main:app --reload
            </div>
          </div>
        )}

        <button
          onClick={() => { setRepoStatus('idle'); setRepoUrl('') }}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', boxShadow: '0 4px 20px rgba(99,102,241,0.35)' }}
        >
          Back to home
        </button>
      </div>
    )
  }

  return (
    <div className="relative w-screen bg-gray-950 overflow-hidden" style={{ height: '100vh', paddingBottom: '52px' }}>
      <Suspense fallback={<LoadingOverlay />}>
        <div className="w-full h-full">
          <Scene />
        </div>
      </Suspense>
      <RepoHeader />
      <SearchBar />
      <Legend />
      <AnimatePresence>
        {selectedNode && <NodePanel key="node-panel" />}
      </AnimatePresence>
      <ChatPanel />
    </div>
  )
}
