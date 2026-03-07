import { useCallback, useEffect, useRef } from 'react'

export function useSSE<T>(
  url: string | null,
  onMessage: (data: T) => void,
  enabled = true,
  onDone?: () => void,
) {
  const sourceRef = useRef<EventSource | null>(null)
  const onMessageRef = useRef(onMessage)
  const onDoneRef = useRef(onDone)
  onMessageRef.current = onMessage
  onDoneRef.current = onDone

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
      // We unconditionally close on any error to prevent infinite reconnect
      // loops to endpoints that close intentionally (e.g., deployment logs
      // after terminal state). The trade-off: transient network errors
      // (laptop sleep/wake, WiFi blip) also kill the connection permanently.
      // A production fix would distinguish transient errors from intentional
      // server close (e.g., via readyState check or retry with max attempts
      // and exponential backoff), but that adds complexity for edge cases
      // that don't affect the demo flow.
      source.close()
      sourceRef.current = null
      onDoneRef.current?.()
    }

    return () => {
      source.close()
      sourceRef.current = null
    }
  }, [url, enabled, stableOnMessage])

  return {
    close: () => {
      sourceRef.current?.close()
      sourceRef.current = null
    },
  }
}
