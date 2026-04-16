import { request } from '@/api/client'

// ── Types ──────────────────────────────────────────────

export interface PipelinePhase {
  phase: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped'
  duration_s: number
  summary: string
  difficulty: string
  input_tokens: number
  output_tokens: number
}

export interface PipelineCampaign {
  pipeline_id: string
  slug: string
  status: 'active' | 'completed' | 'failed' | 'abandoned'
  route: string
  task: string
  current_phase: string | null
  phases: Record<string, PipelinePhase>
  created_at: string
  updated_at: string
  score: number | null
  tokens: { input: number; output: number; total: number }
}

export interface PipelineListResponse {
  campaigns: PipelineCampaign[]
  active: PipelineCampaign | null
}

export interface PipelineScorecard {
  dimensions: Record<string, { score: number; weight: number; weighted: number }>
  final_score: number
  penalties: number
  bugs_remaining: number
}

// ── API calls ──────────────────────────────────────────

function cwdParam(): string {
  const dir = localStorage.getItem('pilot_project_dir') || ''
  return dir ? `?cwd=${encodeURIComponent(dir)}` : ''
}

export async function listCampaigns(): Promise<PipelineListResponse> {
  return request(`/api/pilot/pipeline/campaigns${cwdParam()}`)
}

export async function getCampaign(slug: string): Promise<PipelineCampaign> {
  return request(`/api/pilot/pipeline/campaigns/${slug}${cwdParam()}`)
}

export async function getScorecard(slug: string): Promise<PipelineScorecard | null> {
  try {
    return await request(`/api/pilot/pipeline/campaigns/${slug}/score${cwdParam()}`)
  } catch {
    return null
  }
}

export async function deleteCampaign(slug: string): Promise<void> {
  return request(`/api/pilot/pipeline/campaigns/${slug}${cwdParam()}`, { method: 'DELETE' })
}
