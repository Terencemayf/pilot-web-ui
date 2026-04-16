/**
 * Pipeline Dashboard API — reads campaign state directly from .pilot/ directories.
 *
 * Routes:
 *   GET    /api/pilot/pipeline/campaigns          — list all campaigns
 *   GET    /api/pilot/pipeline/campaigns/:slug     — get single campaign detail
 *   GET    /api/pilot/pipeline/campaigns/:slug/score — get scorecard
 *   DELETE /api/pilot/pipeline/campaigns/:slug     — delete campaign artifacts
 */

import Router from '@koa/router'
import { readdir, readFile, stat, rm } from 'fs/promises'
import { resolve, join } from 'path'
import { homedir } from 'os'
import { existsSync } from 'fs'

export const pipelineRoutes = new Router()

// ── Helpers ────────────────────────────────────────────

/** Resolve the .pilot/ directory — uses ?cwd= query param if provided. */
function getPilotDir(cwd?: string): string {
  const projectDir = cwd || process.env.TERMINAL_CWD || process.cwd()
  return resolve(projectDir, '.pilot')
}

interface PhaseRecord {
  phase: string
  status: string
  duration_s: number
  summary: string
  difficulty: string
  input_tokens: number
  output_tokens: number
}

interface Campaign {
  pipeline_id: string
  slug: string
  status: string
  route: string
  task: string
  current_phase: string | null
  phases: Record<string, PhaseRecord>
  created_at: string
  updated_at: string
  score: number | null
  tokens: { input: number; output: number; total: number }
}

/** Parse campaign.md (YAML frontmatter + markdown body) into Campaign. */
function parseCampaignMd(content: string, slug: string): Campaign {
  const campaign: Campaign = {
    pipeline_id: '',
    slug,
    status: 'unknown',
    route: 'STANDARD',
    task: '',
    current_phase: null,
    phases: {},
    created_at: '',
    updated_at: '',
    score: null,
    tokens: { input: 0, output: 0, total: 0 },
  }

  // Parse frontmatter
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (fmMatch) {
    for (const line of fmMatch[1].split('\n')) {
      const kv = line.match(/^(\w+):\s*(.*)$/)
      if (!kv) continue
      const [, key, val] = kv
      const v = val.trim()
      switch (key) {
        case 'pipeline_id': campaign.pipeline_id = v; break
        case 'status': campaign.status = v; break
        case 'route': campaign.route = v; break
        case 'current_phase': campaign.current_phase = v === 'none' ? null : v; break
        case 'created': campaign.created_at = v; break
        case 'updated': campaign.updated_at = v; break
      }
    }
  }

  // Parse task
  const taskMatch = content.match(/\*\*Task:\*\*\s*(.+)/)
  if (taskMatch) campaign.task = taskMatch[1].trim()

  // Parse progress checkboxes: - [x] phase-name (12.3s, 5000tok)
  const phaseRe = /- \[([ x])\] (\S+)(.*)/g
  let m
  while ((m = phaseRe.exec(content)) !== null) {
    const [, checked, phaseName, extra] = m
    const phase: PhaseRecord = {
      phase: phaseName,
      status: 'pending',
      duration_s: 0,
      summary: '',
      difficulty: '',
      input_tokens: 0,
      output_tokens: 0,
    }

    if (checked === 'x') phase.status = 'completed'
    else if (extra.includes('← current')) phase.status = 'in_progress'
    else if (extra.includes('FAILED')) phase.status = 'failed'

    const durMatch = extra.match(/\(([\d.]+)s/)
    if (durMatch) phase.duration_s = parseFloat(durMatch[1])

    const tokMatch = extra.match(/(\d+)tok/)
    if (tokMatch) {
      const total = parseInt(tokMatch[1], 10)
      // Split roughly 80/20 input/output if we only have total
      phase.input_tokens = Math.round(total * 0.8)
      phase.output_tokens = total - phase.input_tokens
    }

    campaign.phases[phaseName] = phase
  }

  // Calculate total tokens
  let inputTotal = 0, outputTotal = 0
  for (const p of Object.values(campaign.phases)) {
    inputTotal += p.input_tokens
    outputTotal += p.output_tokens
  }
  campaign.tokens = { input: inputTotal, output: outputTotal, total: inputTotal + outputTotal }

  return campaign
}

/** Try to read score.json and extract final_score. */
async function readScore(campaignDir: string): Promise<number | null> {
  try {
    const scorePath = join(campaignDir, 'score.json')
    const raw = await readFile(scorePath, 'utf-8')
    const data = JSON.parse(raw)
    return typeof data.final_score === 'number' ? data.final_score : null
  } catch {
    return null
  }
}

/** Read full scorecard from score.json. */
async function readScorecard(campaignDir: string): Promise<Record<string, unknown> | null> {
  try {
    const scorePath = join(campaignDir, 'score.json')
    const raw = await readFile(scorePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// ── Routes ─────────────────────────────────────────────

/** GET /api/pilot/pipeline/campaigns?cwd=/path/to/project — list all campaigns. */
pipelineRoutes.get('/api/pilot/pipeline/campaigns', async (ctx) => {
  const pilotDir = getPilotDir(ctx.query.cwd as string)

  if (!existsSync(pilotDir)) {
    ctx.body = { campaigns: [], active: null }
    return
  }

  const entries = await readdir(pilotDir, { withFileTypes: true })
  const campaigns: Campaign[] = []
  let active: Campaign | null = null

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const campaignPath = join(pilotDir, entry.name, 'campaign.md')
    try {
      const content = await readFile(campaignPath, 'utf-8')
      const campaign = parseCampaignMd(content, entry.name)
      campaign.score = await readScore(join(pilotDir, entry.name))
      campaigns.push(campaign)
      if (campaign.status === 'active') active = campaign
    } catch {
      // Not a campaign directory — skip
    }
  }

  // Sort: active first, then by updated_at descending
  campaigns.sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1
    if (b.status === 'active' && a.status !== 'active') return 1
    return (b.updated_at || '').localeCompare(a.updated_at || '')
  })

  ctx.body = { campaigns, active }
})

/** GET /api/pilot/pipeline/campaigns/:slug?cwd= — single campaign detail. */
pipelineRoutes.get('/api/pilot/pipeline/campaigns/:slug', async (ctx) => {
  const { slug } = ctx.params
  const pilotDir = getPilotDir(ctx.query.cwd as string)
  const campaignPath = join(pilotDir, slug, 'campaign.md')

  try {
    const content = await readFile(campaignPath, 'utf-8')
    const campaign = parseCampaignMd(content, slug)
    campaign.score = await readScore(join(pilotDir, slug))
    ctx.body = campaign
  } catch {
    ctx.status = 404
    ctx.body = { error: `Campaign '${slug}' not found` }
  }
})

/** GET /api/pilot/pipeline/campaigns/:slug/score?cwd= — scorecard detail. */
pipelineRoutes.get('/api/pilot/pipeline/campaigns/:slug/score', async (ctx) => {
  const { slug } = ctx.params
  const scorecard = await readScorecard(join(getPilotDir(ctx.query.cwd as string), slug))

  if (!scorecard) {
    ctx.status = 404
    ctx.body = { error: `No scorecard for campaign '${slug}'` }
    return
  }

  ctx.body = scorecard
})

/** DELETE /api/pilot/pipeline/campaigns/:slug — delete campaign. */
pipelineRoutes.delete('/api/pilot/pipeline/campaigns/:slug', async (ctx) => {
  const { slug } = ctx.params

  // Sanitize slug to prevent path traversal
  if (slug.includes('..') || slug.includes('/')) {
    ctx.status = 400
    ctx.body = { error: 'Invalid slug' }
    return
  }

  const campaignDir = join(getPilotDir(ctx.query.cwd as string), slug)
  try {
    await rm(campaignDir, { recursive: true })
    ctx.body = { ok: true }
  } catch {
    ctx.status = 404
    ctx.body = { error: `Campaign '${slug}' not found` }
  }
})
