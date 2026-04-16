<script setup lang="ts">
import type { PipelineCampaign, PipelineScorecard } from '@/api/pilot/pipeline'

const props = defineProps<{
  campaign: PipelineCampaign
  scorecard: PipelineScorecard | null
}>()

const PHASE_ORDER = ['git-setup', 'scope', 'plan', 'build', 'review', 'test', 'ship']

function phaseList() {
  const phases = props.campaign.phases || {}
  return PHASE_ORDER
    .filter(p => p in phases)
    .map(p => ({ name: p, ...phases[p] }))
}

function statusClass(status: string) {
  return `phase-${status}`
}

function phaseIcon(status: string) {
  switch (status) {
    case 'completed': return '✓'
    case 'in_progress': return '◉'
    case 'failed': return '✗'
    case 'skipped': return '⊘'
    default: return '○'
  }
}

function formatDuration(s: number) {
  if (!s) return ''
  if (s < 60) return `${s.toFixed(0)}s`
  return `${(s / 60).toFixed(1)}m`
}

function formatTokens(input: number, output: number) {
  const total = input + output
  if (!total) return ''
  if (total > 1000) return `${(total / 1000).toFixed(0)}K tok`
  return `${total} tok`
}

function scoreBarWidth(score: number) {
  return `${Math.max(0, Math.min(100, score * 10))}%`
}

function scoreColor(score: number) {
  if (score >= 8) return '#22c55e'
  if (score >= 6) return '#eab308'
  if (score >= 4) return '#f97316'
  return '#ef4444'
}
</script>

<template>
  <div class="campaign-detail">
    <!-- Header -->
    <div class="detail-header">
      <div>
        <h3>{{ campaign.slug }}</h3>
        <p class="task-text">{{ campaign.task }}</p>
      </div>
      <div class="header-badges">
        <span class="badge route">{{ campaign.route }}</span>
        <span class="badge" :class="`status-${campaign.status}`">{{ campaign.status }}</span>
      </div>
    </div>

    <!-- Phase Timeline -->
    <div class="phases-section">
      <h4>Phases</h4>
      <div class="phase-timeline">
        <div
          v-for="phase in phaseList()"
          :key="phase.name"
          class="phase-row"
          :class="statusClass(phase.status)"
        >
          <span class="phase-icon">{{ phaseIcon(phase.status) }}</span>
          <span class="phase-name">{{ phase.name }}</span>
          <span class="phase-duration">{{ formatDuration(phase.duration_s) }}</span>
          <span class="phase-tokens">{{ formatTokens(phase.input_tokens || 0, phase.output_tokens || 0) }}</span>
          <span class="phase-difficulty" v-if="phase.difficulty">{{ phase.difficulty }}</span>
        </div>
      </div>
    </div>

    <!-- Scorecard -->
    <div class="score-section" v-if="scorecard">
      <h4>Score: {{ scorecard.final_score.toFixed(1) }}/10</h4>
      <div class="score-grid">
        <div
          v-for="(dim, name) in scorecard.dimensions"
          :key="name"
          class="score-row"
        >
          <span class="dim-name">{{ name.replace(/_/g, ' ') }}</span>
          <div class="bar-container">
            <div
              class="bar-fill"
              :style="{ width: scoreBarWidth(dim.score), backgroundColor: scoreColor(dim.score) }"
            />
          </div>
          <span class="dim-score">{{ dim.score.toFixed(0) }}</span>
          <span class="dim-weight">x{{ (dim.weight * 100).toFixed(0) }}%</span>
        </div>
      </div>
      <div class="score-meta" v-if="scorecard.penalties">
        <span>Penalties: {{ scorecard.penalties.toFixed(1) }}</span>
        <span v-if="scorecard.bugs_remaining">Bugs: {{ scorecard.bugs_remaining }}</span>
      </div>
    </div>

    <!-- Token Summary -->
    <div class="token-section" v-if="campaign.tokens?.total">
      <h4>Token Usage</h4>
      <div class="token-bar">
        <div class="token-input" :style="{ flex: campaign.tokens.input }">
          <span>Input: {{ (campaign.tokens.input / 1000).toFixed(0) }}K</span>
        </div>
        <div class="token-output" :style="{ flex: campaign.tokens.output }">
          <span>Output: {{ (campaign.tokens.output / 1000).toFixed(0) }}K</span>
        </div>
      </div>
      <div class="token-total">Total: {{ (campaign.tokens.total / 1000).toFixed(0) }}K tokens</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.campaign-detail {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  background: #fff;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;

  h3 { margin: 0 0 4px; font-size: 18px; }
  .task-text { margin: 0; font-size: 13px; color: $text-secondary; }
}

.header-badges {
  display: flex;
  gap: 8px;
  .badge {
    font-size: 11px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 4px;
    &.route { background: rgba($accent-primary, 0.12); color: $accent-primary; }
    &.status-active { background: rgba($success, 0.12); color: $success; }
    &.status-completed { background: rgba($accent-primary, 0.12); color: $accent-primary; }
    &.status-failed { background: rgba($error, 0.12); color: $error; }
    &.status-abandoned { background: rgba($text-muted, 0.12); color: $text-muted; }
  }
}

.phases-section, .score-section, .token-section {
  margin-bottom: 24px;
  h4 { margin: 0 0 12px; font-size: 14px; font-weight: 600; color: $text-primary; }
}

.phase-timeline {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.phase-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: $radius-sm;
  font-size: 13px;
  background: rgba(0, 0, 0, 0.02);

  &.phase-completed { .phase-icon { color: $success; } }
  &.phase-in_progress { .phase-icon { color: $accent-primary; } background: rgba($accent-primary, 0.06); }
  &.phase-failed { .phase-icon { color: $error; } background: rgba($error, 0.04); }
}

.phase-icon { width: 16px; text-align: center; font-size: 14px; }
.phase-name { width: 80px; font-weight: 500; }
.phase-duration { width: 50px; color: $text-secondary; font-size: 12px; }
.phase-tokens { width: 70px; color: $text-muted; font-size: 11px; }
.phase-difficulty { font-size: 11px; color: $text-muted; font-style: italic; }

.score-grid { display: flex; flex-direction: column; gap: 6px; }

.score-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.dim-name { width: 120px; text-transform: capitalize; color: $text-secondary; }

.bar-container {
  flex: 1;
  height: 8px;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 4px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.dim-score { width: 24px; text-align: right; font-weight: 600; }
.dim-weight { width: 40px; color: $text-muted; font-size: 11px; }

.score-meta {
  margin-top: 8px;
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: $error;
}

.token-bar {
  display: flex;
  height: 24px;
  border-radius: $radius-sm;
  overflow: hidden;
  margin-bottom: 8px;
}

.token-input {
  background: rgba($accent-primary, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  span { color: #fff; font-size: 11px; font-weight: 500; }
}

.token-output {
  background: rgba($accent-primary, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  span { color: #fff; font-size: 11px; font-weight: 500; }
}

.token-total { font-size: 12px; color: $text-secondary; }
</style>
