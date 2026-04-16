import Router from '@koa/router'
import * as pilotCli from '../../services/pilot-cli'

export const sessionRoutes = new Router()

// List sessions from Pilot
sessionRoutes.get('/api/pilot/sessions', async (ctx) => {
  const source = (ctx.query.source as string) || undefined
  const limit = ctx.query.limit ? parseInt(ctx.query.limit as string, 10) : undefined
  const sessions = await pilotCli.listSessions(source, limit)
  ctx.body = { sessions }
})

// Get single session with messages
sessionRoutes.get('/api/pilot/sessions/:id', async (ctx) => {
  const session = await pilotCli.getSession(ctx.params.id)
  if (!session) {
    ctx.status = 404
    ctx.body = { error: 'Session not found' }
    return
  }
  ctx.body = { session }
})

// Delete session from Pilot
sessionRoutes.delete('/api/pilot/sessions/:id', async (ctx) => {
  const ok = await pilotCli.deleteSession(ctx.params.id)
  if (!ok) {
    ctx.status = 500
    ctx.body = { error: 'Failed to delete session' }
    return
  }
  ctx.body = { ok: true }
})

// Rename session
sessionRoutes.post('/api/pilot/sessions/:id/rename', async (ctx) => {
  const { title } = ctx.request.body as { title?: string }
  if (!title || typeof title !== 'string') {
    ctx.status = 400
    ctx.body = { error: 'title is required' }
    return
  }
  const ok = await pilotCli.renameSession(ctx.params.id, title.trim())
  if (!ok) {
    ctx.status = 500
    ctx.body = { error: 'Failed to rename session' }
    return
  }
  ctx.body = { ok: true }
})
