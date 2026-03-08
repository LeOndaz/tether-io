import { useCallback, useEffect, useRef } from 'react'
import { getApiKey } from '../stores/auth'

export function useSSE<T>(
  url: string | null,
  onMessage: (data: T) => void,
  enabled = true,
  onDone?: () => void,
) {
  const abortRef = useRef<AbortController | null>(null)
  const onMessageRef = useRef(onMessage)
  const onDoneRef = useRef(onDone)
  onMessageRef.current = onMessage
  onDoneRef.current = onDone

  const stableOnMessage = useCallback((data: T) => {
    onMessageRef.current(data)
  }, [])

  useEffect(() => {
    if (!enabled || !url) return

    const controller = new AbortController()
    abortRef.current = controller

    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
    }
    const apiKey = getApiKey()
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`
    }
    ;(async () => {
      try {
        const response = await fetch(url, {
          headers,
          signal: controller.signal,
        })

        if (!response.ok || !response.body) {
          onDoneRef.current?.()
          return
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let lineBuf = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          lineBuf += decoder.decode(value, { stream: true })
          const lines = lineBuf.split('\n')
          lineBuf = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6)
            if (data === '[DONE]') continue
            try {
              stableOnMessage(JSON.parse(data) as T)
            } catch {
              // Skip unparseable
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
      } finally {
        abortRef.current = null
        onDoneRef.current?.()
      }
    })()

    return () => {
      controller.abort()
      abortRef.current = null
    }
  }, [url, enabled, stableOnMessage])

  return {
    close: () => {
      abortRef.current?.abort()
      abortRef.current = null
    },
  }
}
