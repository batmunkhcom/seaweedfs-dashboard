import { useState, useRef, useEffect, useCallback } from 'react'
import { Card, Input, Button, Space, Typography, Tag, message, Spin } from 'antd'
import { SendOutlined, RobotOutlined, UserOutlined, ClearOutlined, LoadingOutlined } from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import { getChatbotStatus } from '../../services/api'

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export default function ChatbotPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [currentStream, setCurrentStream] = useState('')
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<any>(null)

  useEffect(() => {
    getChatbotStatus()
      .then((r) => setAiEnabled(r.enabled))
      .catch(() => setAiEnabled(false))
      .finally(() => setStatusLoading(false))
  }, [])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, currentStream])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return

    const userMsg: Message = { role: 'user', content: text, timestamp: Date.now() }
    const history = messages.map((m) => ({ role: m.role, content: m.content }))
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setStreaming(true)
    setCurrentStream('')

    try {
      const csrfResp = await fetch('/api/auth/csrf-token', { credentials: 'include' })
      const csrfData = await csrfResp.json()

      const resp = await fetch('/api/chatbot/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfData.token,
        },
        credentials: 'include',
        body: JSON.stringify({ prompt: text, history }),
      })

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`)
      }

      const reader = resp.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let fullContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)

          if (data === '[DONE]') break
          if (data.startsWith('[ERROR]')) {
            const errMsg = data.slice(8)
            fullContent += `\n\n⚠️ ${errMsg}`
            setCurrentStream(fullContent)
            continue
          }

          try {
            const parsed = JSON.parse(data)
            if (parsed.content) {
              fullContent += parsed.content
              setCurrentStream(fullContent)
            }
          } catch {
            // skip unparseable chunks
          }
        }
      }

      const assistantMsg: Message = { role: 'assistant', content: fullContent, timestamp: Date.now() }
      setMessages((prev) => [...prev, assistantMsg])
      setCurrentStream('')
    } catch (e: any) {
      message.error(e.message || 'Failed to send message')
      const errMsg: Message = { role: 'assistant', content: `⚠️ Error: ${e.message || 'Connection failed'}. Check AI settings and API connectivity.`, timestamp: Date.now() }
      setMessages((prev) => [...prev, errMsg])
      setCurrentStream('')
    }
    setStreaming(false)
  }, [input, streaming, messages])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = () => {
    setMessages([])
    setCurrentStream('')
  }

  if (statusLoading) {
    return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />
  }

  if (aiEnabled === false) {
    return (
      <div style={{ maxWidth: 600, margin: '60px auto', textAlign: 'center' }}>
        <RobotOutlined style={{ fontSize: 48, color: '#64748b', marginBottom: 16 }} />
        <Typography.Title level={4}>AI Chatbot Disabled</Typography.Title>
        <Typography.Paragraph type="secondary">
          The AI-powered chatbot is currently disabled. An administrator can enable it in Settings → AI.
        </Typography.Paragraph>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          Requires OpenAI-compatible API or local Ollama instance.
        </Typography.Paragraph>
      </div>
    )
  }

  const renderMessage = (msg: Message, isStreaming: boolean) => {
    const isUser = msg.role === 'user'
    const isSystem = msg.role === 'system'
    if (isSystem) return null

    return (
      <div
        key={msg.timestamp}
        style={{
          display: 'flex',
          gap: 12,
          padding: '12px 0',
          flexDirection: isUser ? 'row-reverse' : 'row',
        }}
      >
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: isUser ? 'linear-gradient(135deg, #a855f7, #ec4899)' : 'linear-gradient(135deg, #3b82f6, #06b6d4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {isUser ? <UserOutlined style={{ color: '#fff', fontSize: 14 }} /> : <RobotOutlined style={{ color: '#fff', fontSize: 14 }} />}
        </div>
        <div style={{
          maxWidth: '75%',
          padding: '10px 14px',
          borderRadius: 12,
          background: isUser ? 'rgba(168,85,247,0.12)' : 'rgba(30,41,59,0.6)',
          border: isUser ? '1px solid rgba(168,85,247,0.2)' : '1px solid rgba(59,130,246,0.12)',
          fontSize: 13,
          lineHeight: 1.7,
          color: '#e2e8f0',
          wordBreak: 'break-word',
          ...(isUser ? { whiteSpace: 'pre-wrap' } : {}),
        }}>
          {isStreaming && <LoadingOutlined style={{ marginRight: 8, color: '#3b82f6' }} />}
          {isUser ? msg.content : (
            <div className="chatbot-markdown">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 180px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Space>
          <RobotOutlined style={{ color: '#a855f7', fontSize: 20 }} />
          <Typography.Text strong style={{ fontSize: 16 }}>AI Assistant</Typography.Text>
          <Tag color="purple" style={{ fontSize: 10 }}>Cluster Analysis</Tag>
        </Space>
        <Space>
          <Button size="small" icon={<ClearOutlined />} onClick={clearChat} disabled={messages.length === 0}>
            Clear
          </Button>
        </Space>
      </div>

      <Card
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(15,23,42,0.5)',
          border: '1px solid rgba(168,85,247,0.08)',
        }}
        bodyStyle={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 16 }}
      >
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', paddingRight: 8 }}>
          {messages.length === 0 && !streaming && (
            <div style={{ textAlign: 'center', marginTop: 60 }}>
              <RobotOutlined style={{ fontSize: 40, color: '#334155', marginBottom: 16 }} />
              <Typography.Title level={5} style={{ color: '#64748b', marginBottom: 8 }}>Infrastructure AI Assistant</Typography.Title>
              <Typography.Paragraph type="secondary" style={{ fontSize: 13, maxWidth: 400, margin: '0 auto' }}>
                Ask me anything about your SeaweedFS cluster — node health, volume distribution, disk usage, replication status, or general infrastructure questions.
              </Typography.Paragraph>
              <Space style={{ marginTop: 16 }} wrap>
                {['How many volumes are on each node?', 'Which node has the most disk usage?', 'Check cluster health status', 'Show read-only volumes'].map((q) => (
                  <Tag key={q} style={{ cursor: 'pointer', padding: '4px 10px' }} color="purple" onClick={() => { setInput(q); inputRef.current?.focus() }}>
                    {q}
                  </Tag>
                ))}
              </Space>
            </div>
          )}
          {messages.map((msg) => renderMessage(msg, false))}
          {streaming && currentStream && (
            <>{renderMessage({ role: 'assistant', content: currentStream, timestamp: Date.now() }, true)}</>
          )}
          {streaming && !currentStream && (
            <div style={{ padding: 12, color: '#64748b' }}>
              <LoadingOutlined /> Thinking...
            </div>
          )}
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 8, borderTop: '1px solid rgba(168,85,247,0.08)', paddingTop: 12 }}>
          <Input.TextArea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your cluster..."
            autoSize={{ minRows: 1, maxRows: 4 }}
            disabled={streaming}
            style={{
              background: 'rgba(15,23,42,0.8)',
              border: '1px solid rgba(168,85,247,0.12)',
              color: '#e2e8f0',
              resize: 'none',
            }}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={sendMessage}
            loading={streaming}
            disabled={!input.trim()}
            style={{ height: 'auto', minHeight: 38 }}
          >
            Send
          </Button>
        </div>
      </Card>

      <div style={{ textAlign: 'center', marginTop: 8 }}>
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          Cluster context is automatically injected with each query. Response accuracy depends on AI model capability.
        </Typography.Text>
      </div>
    </div>
  )
}
