import { motion } from 'framer-motion'
import { Star, GitFork, Scale, Clock, ExternalLink } from 'lucide-react'
import useStore from '../store'

const LANG_BAR_COLORS = {
  Python: '#818cf8', JavaScript: '#fbbf24', TypeScript: '#38bdf8',
  Java: '#fb923c', Go: '#34d399', 'C++': '#2dd4bf', C: '#a3e635',
  'C#': '#c084fc', Ruby: '#f87171', Rust: '#fb7185', PHP: '#a78bfa',
  HTML: '#f97316', CSS: '#60a5fa', Shell: '#84cc16', Vue: '#4ade80',
}

function formatCount(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return `${n}`
}

function timeAgo(iso) {
  if (!iso) return ''
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days < 1) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function LanguageBar({ languages }) {
  const entries = Object.entries(languages || {}).sort((a, b) => b[1] - a[1])
  if (!entries.length) return null
  const total = entries.reduce((s, [, v]) => s + v, 0)
  const top = entries.slice(0, 5)

  return (
    <div className="mt-2">
      <div className="flex h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        {top.map(([lang, bytes]) => (
          <div key={lang} style={{ width: `${(bytes / total) * 100}%`, background: LANG_BAR_COLORS[lang] || '#94a3b8' }} />
        ))}
      </div>
      <div className="flex gap-3 mt-1.5 flex-wrap">
        {top.map(([lang, bytes]) => (
          <span key={lang} className="flex items-center gap-1 text-[10px]" style={{ color: '#64748b' }}>
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: LANG_BAR_COLORS[lang] || '#94a3b8' }} />
            {lang} {((bytes / total) * 100).toFixed(0)}%
          </span>
        ))}
      </div>
    </div>
  )
}

export default function RepoHeader() {
  const repoMeta = useStore((s) => s.repoMeta)
  const graph    = useStore((s) => s.graph)

  const repoName = repoMeta?.full_name || graph?.metadata?.repo
  if (!repoName) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="fixed top-4 left-4 z-20 rounded-2xl px-4 py-3"
      style={{
        background: 'rgba(15,17,26,0.75)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        maxWidth: 300,
      }}
    >
      <a
        href={repoMeta?.html_url || `https://github.com/${repoName}`}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1.5 group"
      >
        <span className="text-sm font-semibold text-white truncate group-hover:text-indigo-300 transition-colors">
          {repoName}
        </span>
        <ExternalLink size={11} className="shrink-0 text-gray-600 group-hover:text-indigo-400 transition-colors" />
      </a>

      {repoMeta?.description && (
        <p className="text-[11px] mt-1 leading-snug line-clamp-2" style={{ color: '#64748b' }}>
          {repoMeta.description}
        </p>
      )}

      {repoMeta && (
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <span className="flex items-center gap-1 text-[11px]" style={{ color: '#fbbf24' }}>
            <Star size={11} /> {formatCount(repoMeta.stars)}
          </span>
          <span className="flex items-center gap-1 text-[11px]" style={{ color: '#94a3b8' }}>
            <GitFork size={11} /> {formatCount(repoMeta.forks)}
          </span>
          {repoMeta.license && repoMeta.license !== 'NOASSERTION' && (
            <span className="flex items-center gap-1 text-[11px]" style={{ color: '#94a3b8' }}>
              <Scale size={11} /> {repoMeta.license}
            </span>
          )}
          {repoMeta.pushed_at && (
            <span className="flex items-center gap-1 text-[11px]" style={{ color: '#64748b' }}>
              <Clock size={11} /> {timeAgo(repoMeta.pushed_at)}
            </span>
          )}
        </div>
      )}

      <LanguageBar languages={repoMeta?.languages} />

      {repoMeta?.contributors?.length > 0 && (
        <div className="flex items-center mt-2.5 gap-1.5">
          <div className="flex -space-x-1.5">
            {repoMeta.contributors.map((c) => (
              <img
                key={c.login}
                src={c.avatar_url}
                alt={c.login}
                title={`${c.login} · ${c.contributions} commits`}
                className="w-5 h-5 rounded-full"
                style={{ border: '1.5px solid #0f111a' }}
              />
            ))}
          </div>
          <span className="text-[10px]" style={{ color: '#475569' }}>top contributors</span>
        </div>
      )}
    </motion.div>
  )
}
