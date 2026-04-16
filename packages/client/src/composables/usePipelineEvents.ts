import { ref, onMounted, onUnmounted } from 'vue'
import { getApiKey } from '@/api/client'

export interface PipelineEvent {
  type: string
  slug?: string
  phase?: string
  status?: string
  current_phase?: string | null
  route?: string
  duration_s?: number
  ts?: string
}

/**
 * Composable that connects to the pipeline WebSocket and streams events.
 * Auto-reconnects on disconnect.
 */
export function usePipelineEvents(onEvent?: (e: PipelineEvent) => void) {
  const connected = ref(false)
  const lastEvent = ref<PipelineEvent | null>(null)
  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const token = getApiKey()
    const url = `${proto}//${location.host}/api/pilot/pipeline/events${token ? `?token=${token}` : ''}`

    ws = new WebSocket(url)

    ws.onopen = () => {
      connected.value = true
    }

    ws.onmessage = (msg) => {
      try {
        const event: PipelineEvent = JSON.parse(msg.data)
        lastEvent.value = event
        onEvent?.(event)
      } catch { /* ignore non-JSON */ }
    }

    ws.onclose = () => {
      connected.value = false
      // Auto-reconnect after 3s
      reconnectTimer = setTimeout(connect, 3000)
    }

    ws.onerror = () => {
      ws?.close()
    }
  }

  onMounted(connect)

  onUnmounted(() => {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    ws?.close()
  })

  return { connected, lastEvent }
}
