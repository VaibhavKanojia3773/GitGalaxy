import useStore from '../store'

export function useGraphData() {
  const setGraph          = useStore((s) => s.setGraph)
  const setRepoStatus     = useStore((s) => s.setRepoStatus)
  const setLoadingProgress = useStore((s) => s.setLoadingProgress)
  const provider          = useStore((s) => s.provider)
  const apiKey            = useStore((s) => s.apiKey)

  async function loadRepo(url) {
    setRepoStatus('loading')
    setLoadingProgress({ stage: 'starting', message: 'Connecting...', pct: 0 })

    try {
      const resp = await fetch('/api/repo/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, provider, api_key: apiKey }),
      })

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }))
        setRepoStatus('error', err.detail || 'Unknown error')
        return
      }

      const decoder = new TextDecoder()
      const reader  = resp.body.getReader()
      let buffer    = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // parse SSE lines from buffer
        const lines = buffer.split('\n')
        buffer = lines.pop() // keep incomplete last line

        let eventName = ''
        let dataLine  = ''

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventName = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            dataLine = line.slice(6).trim()
          } else if (line === '' && eventName && dataLine) {
            // dispatch completed SSE event
            try {
              const payload = JSON.parse(dataLine)
              if (eventName === 'progress') {
                setLoadingProgress({
                  stage:   payload.stage   || '',
                  message: payload.message || '',
                  pct:     payload.pct     || 0,
                })
              } else if (eventName === 'done') {
                setGraph(payload.graph)
                setRepoStatus('ready')
                setLoadingProgress({ stage: 'done', message: 'Galaxy ready!', pct: 100 })
              } else if (eventName === 'error') {
                setRepoStatus('error', payload.detail || 'Pipeline error')
              }
            } catch (_) {
              // malformed JSON — skip
            }
            eventName = ''
            dataLine  = ''
          }
        }
      }
    } catch (e) {
      setRepoStatus('error', e.message || 'Network error')
    }
  }

  return { loadRepo }
}
