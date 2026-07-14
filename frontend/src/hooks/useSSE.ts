import { useEffect } from 'react'
import { useSseContext } from '../components/SseProvider'

export function useSSE(eventType: string, callback: (data: unknown) => void) {
  const { subscribe } = useSseContext()

  useEffect(() => {
    const unsubscribe = subscribe(eventType, callback)
    return unsubscribe
  }, [eventType, callback, subscribe])
}
