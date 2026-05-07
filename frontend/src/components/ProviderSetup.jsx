import { Cpu, Zap, Cloud } from 'lucide-react'

const PROVIDERS = [
  {
    id: 'local',
    label: 'Local',
    icon: Cpu,
    desc: 'Runs on your CPU. No API key. Downloads ~550MB model on first use.',
    needsKey: false,
    keyPlaceholder: '',
    keyLabel: '',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    icon: Zap,
    desc: 'Google text-embedding-004. Free tier: 1500 req/day. Fast, no local model.',
    needsKey: true,
    keyPlaceholder: 'AIza...',
    keyLabel: 'Gemini API key',
    keyLink: 'https://aistudio.google.com/apikey',
    keyLinkLabel: 'Get free key →',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    icon: Cloud,
    desc: 'text-embedding-3-small. Paid. Fastest & highest quality.',
    needsKey: true,
    keyPlaceholder: 'sk-...',
    keyLabel: 'OpenAI API key',
    keyLink: 'https://platform.openai.com/api-keys',
    keyLinkLabel: 'Get key →',
  },
]

export default function ProviderSetup({ provider, apiKey, onChange }) {
  const selected = PROVIDERS.find((p) => p.id === provider) || PROVIDERS[0]

  return (
    <div className="mt-5 pt-4 border-t border-gray-800">
      <p className="text-xs text-gray-500 mb-2">Embedding provider</p>

      {/* tabs */}
      <div className="flex gap-1 mb-3">
        {PROVIDERS.map((p) => {
          const Icon = p.icon
          const active = provider === p.id
          return (
            <button
              key={p.id}
              onClick={() => onChange({ provider: p.id, apiKey: '' })}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors
                ${active
                  ? 'bg-indigo-700 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
            >
              <Icon size={12} />
              {p.label}
            </button>
          )
        })}
      </div>

      {/* description */}
      <p className="text-xs text-gray-500 mb-2">{selected.desc}</p>

      {/* API key input */}
      {selected.needsKey && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-400">{selected.keyLabel}</label>
            {selected.keyLink && (
              <a
                href={selected.keyLink}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-indigo-400 hover:text-indigo-300"
              >
                {selected.keyLinkLabel}
              </a>
            )}
          </div>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => onChange({ provider, apiKey: e.target.value })}
            placeholder={selected.keyPlaceholder}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
      )}
    </div>
  )
}
