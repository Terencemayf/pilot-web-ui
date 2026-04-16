import { resolve } from 'path'
import { tmpdir } from 'os'

import { readFileSync, existsSync } from 'fs'
import { homedir } from 'os'

/** Read API_SERVER_KEY from ~/.pilot/.env (same source gateway uses). */
function loadGatewayApiKey(): string {
  const envPath = resolve(homedir(), '.pilot', '.env')
  if (!existsSync(envPath)) return ''
  try {
    const content = readFileSync(envPath, 'utf-8')
    for (const line of content.split('\n')) {
      const m = line.match(/^API_SERVER_KEY\s*=\s*(.+)/)
      if (m) return m[1].trim().replace(/^['"]|['"]$/g, '')
    }
  } catch { /* ignore */ }
  return ''
}

export const config = {
  port: parseInt(process.env.PORT || '8648', 10),
  upstream: process.env.UPSTREAM || 'http://127.0.0.1:8642',
  uploadDir: process.env.UPLOAD_DIR || resolve(tmpdir(), 'pilot-uploads'),
  dataDir: resolve(__dirname, '..', 'data'),
  corsOrigins: process.env.CORS_ORIGINS || '*',
  gatewayApiKey: process.env.GATEWAY_API_KEY || loadGatewayApiKey(),
}
