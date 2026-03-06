import { useCallback, useEffect, useRef } from 'react'

export function useSSE<T>(url: string | null, onMessage: (data: T) => void, enabled = true) {
  const sourceRef = useRef<EventSource | null>(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const stableOnMessage = useCallback((data: T) => {
    onMessageRef.current(data)
  }, [])

  useEffect(() => {
    if (!enabled || !url) return

    const source = new EventSource(url)
    sourceRef.current = source

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as T
        stableOnMessage(data)
      } catch {
        // Ignore unparseable messages
      }
    }

    source.onerror = () => {
      source.close()
    }

    return () => {
      source.close()
      sourceRef.current = null
    }
  }, [url, enabled, stableOnMessage])

  return {
    close: () => sourceRef.current?.close(),
  }
}
