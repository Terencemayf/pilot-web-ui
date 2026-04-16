/**
 * Pipeline Progress WebSocket — streams real-time phase events to the dashboard.
 *
 * Watches .pilot/{slug}/campaign.md for changes and pushes updates.
 * Also accepts POST events from the gateway for instant notifications.
 *
 * WebSocket URL: /api/pilot/pipeline/events?token=xxx
 *
 * Events sent to client (JSON):
 *   { type: "phase.start", phase: "build", slug: "my-task" }
 *   { type: "phase.end", phase: "build", status: "completed", duration_s: 45.2 }
 *   { type: "pipeline.start", route: "STANDARD", slug: "my-task" }
 *   { type: "campaign.update", slug: "my-task", ...campaign }
 */

import { WebSocketServer, WebSocket } from 'ws'
import type { Server as HttpServer } from 'http'
import { watch, existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { resolve, join } from 'path'
import { homedir } from 'os'
import { getToken } from '../../services/auth'

interface WsClient {
  ws: WebSocket
  cwd: string  // project dir this client is watching
}

const clients: WsClient[] = []
const watchers = new Map<string, ReturnType<typeof watch>>()

/** Broadcast to clients watching a specific project dir. */
function broadcast(cwd: string, event: Record<string, unknown>) {
  const msg = JSON.stringify(event)
  clients.forEach((c) => {
    if (c.cwd === cwd && c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(msg)
    }
  })
}

/** Start watching a project's .pilot/ directory. */
function ensureWatcher(cwd: string) {
  if (watchers.has(cwd)) return

  const pilotDir = resolve(cwd, '.pilot')
  if (!existsSync(pilotDir)) return

  try {
    const watcher = watch(pilotDir, { recursive: true }, async (eventType, filename) => {
      if (!filename || !filename.endsWith('campaign.md')) return

      const parts = filename.split('/')
      if (parts.length < 2) return
      const slug = parts[0]

      try {
        const campaignPath = join(pilotDir, slug, 'campaign.md')
        const content = await readFile(campaignPath, 'utf-8')

        const statusMatch = content.match(/^status:\s*(.+)/m)
        const phaseMatch = content.match(/^current_phase:\s*(.+)/m)
        const routeMatch = content.match(/^route:\s*(.+)/m)

        broadcast(cwd, {
          type: 'campaign.update',
          slug,
          status: statusMatch?.[1]?.trim() || 'unknown',
          current_phase: phaseMatch?.[1]?.trim() || null,
          route: routeMatch?.[1]?.trim() || 'STANDARD',
        })
      } catch {
        // File may be mid-write
      }
    })
    watchers.set(cwd, watcher)

    // Clean up on process exit
    process.on('beforeExit', () => watcher.close())
  } catch (err) {
    console.error('Pipeline watcher failed to start:', err)
  }
}

/** Accept pushed events from the gateway/engine (internal use). */
export function pushPipelineEvent(event: Record<string, unknown>) {
  // Broadcast to all clients (no cwd filter for pushed events)
  const msg = JSON.stringify({ ...event, ts: new Date().toISOString() })
  clients.forEach((c) => {
    if (c.ws.readyState === WebSocket.OPEN) c.ws.send(msg)
  })
}

export function setupPipelineWebSocket(httpServer: HttpServer) {
  const wss = new WebSocketServer({ noServer: true })

  httpServer.on('upgrade', async (req, socket, head) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`)
    if (url.pathname !== '/api/pilot/pipeline/events') return

    // Auth check
    const token = url.searchParams.get('token')
    const expected = await getToken()
    if (expected && token !== expected) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      // Extract cwd from query param
      const cwd = url.searchParams.get('cwd') || process.env.TERMINAL_CWD || homedir()
      wss.emit('connection', ws, req, cwd)
    })
  })

  wss.on('connection', (ws: WebSocket, _req: any, cwd: string) => {
    const client: WsClient = { ws, cwd }
    clients.push(client)

    // Start watching this project dir if not already
    ensureWatcher(cwd)

    const removeClient = () => {
      const i = clients.indexOf(client)
      if (i >= 0) clients.splice(i, 1)
    }
    ws.on('close', removeClient)
    ws.on('error', removeClient)

    // Client can switch project by sending { type: "watch", cwd: "..." }
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'watch' && msg.cwd) {
          client.cwd = msg.cwd
          ensureWatcher(msg.cwd)
          ws.send(JSON.stringify({ type: 'watching', cwd: msg.cwd }))
        }
      } catch { /* ignore */ }
    })

    ws.send(JSON.stringify({ type: 'connected', cwd, ts: new Date().toISOString() }))
  })
}
