import { useQuery } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import { API_BASE, deploymentsApi } from '../../api/client'
import { useAuthStore } from '../../stores/auth'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export default function PlaygroundPage() {
  const { data: deployments } = useQuery({
    queryKey: ['deployments'],
    queryFn: deploymentsApi.list,
  })

  const [apiKeyOverride, setApiKeyOverride] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const readyDeployments = deployments?.filter((d) => d.status === 'ready') || []

  const handleSend = useCallback(async () => {
    if (!input.trim() || !selectedModel || streaming) return

    const userMessage: ChatMessage = { role: 'user', content: input.trim() }
    const allMessages = [...messages, userMessage]
    setMessages(allMessages)
    setInput('')
    setStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      }
      if (apiKeyOverride) {
        headers.Authorization = `Bearer ${apiKeyOverride}`
      } else {
        const csrfToken = useAuthStore.getState().user?.csrfToken
        if (csrfToken) {
          headers['x-csrf-token'] = csrfToken
        }
      }
      const response = await fetch(`${API_BASE}/v1/chat/completions`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          model: selectedModel,
          messages: allMessages,
          stream: true,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error?.message || `Error: ${response.status}`)
      }

      const body = response.body
      if (!body) throw new Error('No response body')
      const reader = body.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''
      let lineBuf = ''

      setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        lineBuf += decoder.decode(value, { stream: true })
        const lines = lineBuf.split('\n')
        // Last element may be an incomplete line — keep it in the buffer
        lineBuf = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            if (parsed.error) {
              throw new Error(parsed.error.message ?? parsed.error)
            }
            const delta = parsed.choices?.[0]?.delta?.content as string | undefined
            if (delta) {
              assistantContent += delta
              setMessages((prev) => {
                const next = [...prev]
                next[next.length - 1] = { role: 'assistant', content: assistantContent }
                return next
              })
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message) throw parseErr
          }
        }
      }

      // Flush any remaining data in the line buffer
      if (lineBuf.trim()) {
        const remaining = lineBuf.trim()
        if (remaining.startsWith('data: ') && remaining.slice(6) !== '[DONE]') {
          try {
            const parsed = JSON.parse(remaining.slice(6))
            const delta = parsed.choices?.[0]?.delta?.content as string | undefined
            if (delta) {
              assistantContent += delta
              setMessages((prev) => {
                const next = [...prev]
                next[next.length - 1] = { role: 'assistant', content: assistantContent }
                return next
              })
            }
          } catch {
            // Skip unparseable
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        const errorMsg = err.message || 'Unknown error'
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          // Replace empty assistant placeholder with error, or append error
          if (last?.role === 'assistant' && !last.content) {
            const next = [...prev]
            next[next.length - 1] = { role: 'assistant', content: `Error: ${errorMsg}` }
            return next
          }
          return [...prev, { role: 'assistant', content: `Error: ${errorMsg}` }]
        })
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }, [input, apiKeyOverride, selectedModel, messages, streaming])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>Inference Playground</h2>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <input
          type="password"
          value={apiKeyOverride}
          onChange={(e) => setApiKeyOverride(e.target.value)}
          placeholder="API key override (optional)"
          style={{
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontSize: 14,
            width: 280,
            fontFamily: 'monospace',
          }}
        />
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontSize: 14,
          }}
        >
          <option value="">Select Model</option>
          {readyDeployments.map((d) => (
            <option key={d.id} value={d.model}>
              {d.model}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setMessages([])
          }}
          style={{
            padding: '8px 16px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            cursor: 'pointer',
            background: 'white',
            fontSize: 14,
          }}
        >
          Clear
        </button>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          backgroundColor: 'white',
          borderRadius: 8,
          border: '1px solid #e5e7eb',
          padding: 16,
          marginBottom: 16,
        }}
      >
        {messages.length === 0 && (
          <p style={{ color: '#9ca3af', textAlign: 'center', paddingTop: 40 }}>
            Select a model and start chatting. Session auth is used by default.
          </p>
        )}
        {messages.map((msg, msgIndex) => (
          <div
            key={`${msg.role}-${msgIndex}`}
            style={{
              marginBottom: 16,
              display: 'flex',
              flexDirection: 'column',
              alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <span style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
              {msg.role === 'user' ? 'You' : 'Assistant'}
            </span>
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                maxWidth: '80%',
                fontSize: 14,
                lineHeight: 1.6,
                backgroundColor: msg.role === 'user' ? '#2563eb' : '#f3f4f6',
                color: msg.role === 'user' ? 'white' : '#111827',
                whiteSpace: 'pre-wrap',
              }}
            >
              {msg.content || (streaming && msgIndex === messages.length - 1 ? '...' : '')}
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          handleSend()
        }}
        style={{ display: 'flex', gap: 8 }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={streaming}
          style={{
            flex: 1,
            padding: '10px 14px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontSize: 14,
          }}
        />
        <button
          type="submit"
          disabled={streaming || !selectedModel}
          style={{
            padding: '10px 24px',
            backgroundColor: streaming ? '#9ca3af' : '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: streaming ? 'not-allowed' : 'pointer',
            fontSize: 14,
          }}
        >
          {streaming ? 'Streaming...' : 'Send'}
        </button>
      </form>
    </div>
  )
}
