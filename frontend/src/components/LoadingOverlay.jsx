import { useEffect, useState } from 'react'

const MESSAGES = [
  'Fetching repository...',
  'Chunking code...',
  'Computing embeddings...',
  'Building galaxy...',
]

export default function LoadingOverlay() {
  const [msgIdx, setMsgIdx] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setMsgIdx((i) => (i + 1) % MESSAGES.length)
    }, 4000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="fixed inset-0 bg-gray-950 flex flex-col items-center justify-center z-50">
      <div className="relative w-32 h-32 mb-8">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="absolute inset-0 rounded-full border border-indigo-500 opacity-40 animate-ping"
            style={{ animationDelay: `${i * 0.4}s`, animationDuration: '1.8s' }}
          />
        ))}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full bg-indigo-400 animate-pulse" />
        </div>
      </div>

      <div className="stars-container relative w-64 h-2 overflow-hidden mb-6">
        <div className="h-full bg-gradient-to-r from-transparent via-indigo-500 to-transparent animate-pulse" />
      </div>

      <p className="text-indigo-300 text-sm font-medium tracking-wide transition-all duration-500">
        {MESSAGES[msgIdx]}
      </p>
      <p className="text-gray-600 text-xs mt-2">
        First run downloads ~550MB model — subsequent loads are instant
      </p>
    </div>
  )
}
