import React, { createContext, useContext, useEffect, useRef, useCallback } from 'react'

type SseEventCallback = (data: unknown) => void

interface SseContextValue {
  subscribe: (eventType: string, callback: SseEventCallback) => () => void
}

const SseContext = createContext<SseContextValue>({ subscribe: () => () => {} })

export function useSseContext() {
  return useContext(SseContext)
}

export function SseProvider({ children }: { children: React.ReactNode }) {
  const listenersRef = useRef<Map<string, Set<SseEventCallback>>>(new Map())

  const subscribe = useCallback((eventType: string, callback: SseEventCallback) => {
    if (!listenersRef.current.has(eventType)) {
      listenersRef.current.set(eventType, new Set())
    }
    listenersRef.current.get(eventType)!.add(callback)
    return () => {
      listenersRef.current.get(eventType)?.delete(callback)
    }
  }, [])

  useEffect(() => {
    let eventSource: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout>
    let reconnectDelay = 1000

    function connect() {
      eventSource = new EventSource('/api/dashboard/sse')

      eventSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data)
          const eventType = parsed.event || 'message'
          const data = parsed.data ? JSON.parse(parsed.data) : parsed
          listenersRef.current.get(eventType)?.forEach((cb) => cb(data))
        } catch {}
      }

      eventSource.onopen = () => {
        reconnectDelay = 1000
      }

      eventSource.onerror = () => {
        eventSource?.close()
        reconnectTimer = setTimeout(() => {
          reconnectDelay = Math.min(reconnectDelay * 2, 30000)
          connect()
        }, reconnectDelay)
      }
    }

    connect()

    return () => {
      eventSource?.close()
      clearTimeout(reconnectTimer)
    }
  }, [])

  return <SseContext.Provider value={{ subscribe }}>{children}</SseContext.Provider>
}
