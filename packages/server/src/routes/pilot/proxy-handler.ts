import type { Context } from 'koa'
import { config } from '../../config'

export async function proxy(ctx: Context) {
  const upstream = config.upstream.replace(/\/$/, '')
  // Rewrite path for upstream gateway:
  //   /api/pilot/v1/* -> /v1/*  (upstream uses /v1/ prefix)
  //   /api/pilot/*     -> /api/* (upstream uses /api/ prefix)
  const upstreamPath = ctx.path.replace(/^\/api\/pilot\/v1/, '/v1').replace(/^\/api\/pilot/, '/api')
  const url = `${upstream}${upstreamPath}${ctx.search || ''}`
  console.log(`[PROXY] ${ctx.method} ${ctx.path} -> ${url}`)

  // Build headers — forward most, strip browser-specific ones
  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(ctx.headers)) {
    if (value == null) continue
    const lower = key.toLowerCase()
    if (lower === 'host') {
      headers['host'] = new URL(upstream).host
    } else if (lower === 'authorization') {
      // Replace BFF auth with gateway's API_SERVER_KEY
      // The browser sends the BFF token, but the gateway expects its own key
      continue  // Skip — we'll set the correct one below
    } else if (lower !== 'origin' && lower !== 'referer' && lower !== 'connection') {
      const v = Array.isArray(value) ? value[0] : value
      if (v) headers[key] = v
    }
  }

  // Inject gateway API key for upstream auth
  const gatewayKey = config.gatewayApiKey
  if (gatewayKey) {
    headers['authorization'] = `Bearer ${gatewayKey}`
  }

  // Add SSE-friendly headers
  if (ctx.path.match(/\/events$/)) {
    headers['x-accel-buffering'] = 'no'
    headers['cache-control'] = 'no-cache'
  }

  try {
    // Build request body from raw body
    let body: string | undefined
    if (ctx.req.method !== 'GET' && ctx.req.method !== 'HEAD') {
      body = (ctx as any).request.rawBody as string | undefined
    }

    const res = await fetch(url, {
      method: ctx.req.method,
      headers,
      body,
    })

    // Set response headers
    const resHeaders: Record<string, string> = {}
    res.headers.forEach((value, key) => {
      const lower = key.toLowerCase()
      if (lower !== 'transfer-encoding' && lower !== 'connection') {
        resHeaders[key] = value
      }
    })
    if (ctx.path.match(/\/events$/)) {
      resHeaders['x-accel-buffering'] = 'no'
      resHeaders['cache-control'] = 'no-cache'
    }

    ctx.status = res.status
    ctx.set(resHeaders)

    // Stream response body
    if (res.body) {
      const reader = res.body.getReader()
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          ctx.res.write(value)
        }
        ctx.res.end()
      }
      await pump()
    } else {
      ctx.res.end()
    }
  } catch (err: any) {
    if (!ctx.res.headersSent) {
      ctx.status = 502
      ctx.set('Content-Type', 'application/json')
      ctx.body = { error: { message: `Proxy error: ${err.message}` } }
    } else {
      ctx.res.end()
    }
  }
}
