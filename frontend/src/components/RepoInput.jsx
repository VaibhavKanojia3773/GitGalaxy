import { useState } from 'react'
import useStore from '../store'
import { useGraphData } from '../hooks/useGraphData'

const EXAMPLES = [
  { label: 'fastapi/fastapi', url: 'https://github.com/fastapi/fastapi' },
  { label: 'pallets/flask', url: 'https://github.com/pallets/flask' },
  { label: 'psf/requests', url: 'https://github.com/psf/requests' },
]

export default function RepoInput() {
  const [input, setInput] = useState('')
  const setRepoUrl = useStore((s) => s.setRepoUrl)
  const { loadRepo } = useGraphData()

  function handleSubmit(e) {
    e.preventDefault()
    const url = input.trim()
    if (!url) return
    setRepoUrl(url)
    loadRepo(url)
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-950">
      <div className="w-full max-w-lg px-8 py-10 bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl">
        <h1 className="text-4xl font-bold text-center mb-2 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
          GitGalaxy
        </h1>
        <p className="text-center text-gray-400 text-sm mb-8">
          Explore any GitHub repository as a 3D semantic galaxy
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://github.com/owner/repo"
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <button
            type="submit"
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition-colors"
          >
            Launch Galaxy
          </button>
        </form>

        <div className="mt-6">
          <p className="text-gray-500 text-xs mb-3 text-center">Quick examples</p>
          <div className="flex gap-2 justify-center flex-wrap">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                onClick={() => setInput(ex.url)}
                className="px-3 py-1 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-full text-gray-300 transition-colors"
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
