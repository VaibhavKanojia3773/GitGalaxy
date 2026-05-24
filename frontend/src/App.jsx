import { Suspense } from 'react'
import useStore from './store'
import RepoInput from './components/RepoInput'
import LoadingOverlay from './components/LoadingOverlay'
import Scene from './components/Scene'
import SearchBar from './components/SearchBar'
import NodePanel from './components/NodePanel'
import Legend from './components/Legend'
import ChatPanel from './components/ChatPanel'

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
    return <LoadingOverlay />
  }

  if (repoStatus === 'error') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-white gap-6">
        <div className="text-red-400 text-xl font-semibold">Failed to load repository</div>
        <div className="text-gray-400 text-sm max-w-md text-center">{repoError}</div>
        <button
          onClick={() => { setRepoStatus('idle'); setRepoUrl('') }}
          className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
        >
          Try again
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
      <SearchBar />
      <Legend />
      {selectedNode && <NodePanel />}
      <ChatPanel />
    </div>
  )
}
