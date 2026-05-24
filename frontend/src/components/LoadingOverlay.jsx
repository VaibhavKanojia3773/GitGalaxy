import useStore from '../store'

export default function LoadingOverlay() {
  const { stage, message, pct } = useStore((s) => s.loadingProgress)

  const displayMessage = message || 'Preparing galaxy...'

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

      {/* progress bar */}
      <div className="w-72 mb-5">
        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-600 to-purple-500 rounded-full transition-all duration-500"
            style={{ width: `${Math.max(2, pct)}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-gray-600 text-xs capitalize">{stage || 'starting'}</span>
          <span className="text-gray-600 text-xs">{pct}%</span>
        </div>
      </div>

      <p className="text-indigo-300 text-sm font-medium tracking-wide transition-all duration-500">
        {displayMessage}
      </p>
      <p className="text-gray-600 text-xs mt-2">
        First run downloads ~550MB model — subsequent loads are instant
      </p>
    </div>
  )
}
