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

const clients: WebSocket[] = []

function getPilotDir(): string {
  const projectDir = process.env.TERMINAL_CWD || process.cwd()
  return resolve(projectDir, '.pilot')
}

/** Broadcast a JSON event to all connected clients. */
function broadcast(event: Record<string, unknown>) {
  const msg = JSON.stringify(event)
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg)
    }
  })
}

/** Watch .pilot/ for campaign.md changes and broadcast updates. */
function startWatcher() {
  const pilotDir = getPilotDir()
  if (!existsSync(pilotDir)) return

  try {
    // Watch recursively for campaign.md changes
    const watcher = watch(pilotDir, { recursive: true }, async (eventType, filename) => {
      if (!filename || !filename.endsWith('campaign.md')) return

      // Extract slug from path: {slug}/campaign.md
      const parts = filename.split('/')
      if (parts.length < 2) return
      const slug = parts[0]

      try {
        const campaignPath = join(pilotDir, slug, 'campaign.md')
        const content = await readFile(campaignPath, 'utf-8')

        // Quick-parse status and current phase from frontmatter
        const statusMatch = content.match(/^status:\s*(.+)/m)
        const phaseMatch = content.match(/^current_phase:\s*(.+)/m)
        const routeMatch = content.match(/^route:\s*(.+)/m)

        broadcast({
          type: 'campaign.update',
          slug,
          status: statusMatch?.[1]?.trim() || 'unknown',
          current_phase: phaseMatch?.[1]?.trim() || null,
          route: routeMatch?.[1]?.trim() || 'STANDARD',
        })
      } catch {
        // File may be mid-write — ignore
      }
    })

    // Clean up on process exit
    process.on('beforeExit', () => watcher.close())
  } catch (err) {
    console.error('Pipeline watcher failed to start:', err)
  }
}

/** Accept pushed events from the gateway/engine (internal use). */
export function pushPipelineEvent(event: Record<string, unknown>) {
  broadcast({ ...event, ts: new Date().toISOString() })
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
      wss.emit('connection', ws, req)
    })
  })

  wss.on('connection', (ws) => {
    clients.push(ws)
    ws.on('close', () => { const i = clients.indexOf(ws); if (i >= 0) clients.splice(i, 1) })
    ws.on('error', () => { const i = clients.indexOf(ws); if (i >= 0) clients.splice(i, 1) })

    // Send initial state
    ws.send(JSON.stringify({ type: 'connected', ts: new Date().toISOString() }))
  })

  // Start file watcher for campaign changes
  startWatcher()
}
