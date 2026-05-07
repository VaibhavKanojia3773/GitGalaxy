import useStore from '../store'

export function useGraphData() {
  const setGraph = useStore((s) => s.setGraph)
  const setRepoStatus = useStore((s) => s.setRepoStatus)
  const provider = useStore((s) => s.provider)
  const apiKey = useStore((s) => s.apiKey)

  async function loadRepo(url) {
    setRepoStatus('loading')
    try {
      const resp = await fetch('/api/repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, provider, api_key: apiKey }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }))
        setRepoStatus('error', err.detail || 'Unknown error')
        return
      }
      const data = await resp.json()
      setGraph(data.graph)
      setRepoStatus('ready')
    } catch (e) {
      setRepoStatus('error', e.message || 'Network error')
    }
  }

  return { loadRepo }
}
