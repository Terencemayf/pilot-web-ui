<script setup lang="ts">
import type { PipelineCampaign } from '@/api/pilot/pipeline'

defineProps<{
  campaigns: PipelineCampaign[]
  active: PipelineCampaign | null
  selectedSlug: string | null
}>()

const emit = defineEmits<{
  select: [slug: string]
  delete: [slug: string]
}>()

function statusIcon(status: string) {
  switch (status) {
    case 'active': return '▶'
    case 'completed': return '✓'
    case 'failed': return '✗'
    case 'abandoned': return '⊘'
    default: return '·'
  }
}

function statusClass(status: string) {
  return `status-${status}`
}

function routeBadge(route: string) {
  switch (route) {
    case 'QUICK': return 'Q'
    case 'LIGHT': return 'L'
    case 'STANDARD': return 'S'
    case 'FULL': return 'F'
    default: return route[0]
  }
}

function formatTime(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diffH = (now.getTime() - d.getTime()) / 3600000
  if (diffH < 1) return `${Math.round(diffH * 60)}m ago`
  if (diffH < 24) return `${Math.round(diffH)}h ago`
  return d.toLocaleDateString()
}
</script>

<template>
  <div class="campaign-list">
    <div class="list-header">Campaigns</div>
    <div
      v-for="c in campaigns"
      :key="c.slug"
      class="campaign-item"
      :class="{ selected: c.slug === selectedSlug, active: c.status === 'active' }"
      @click="emit('select', c.slug)"
    >
      <div class="item-top">
        <span class="status-icon" :class="statusClass(c.status)">{{ statusIcon(c.status) }}</span>
        <span class="slug">{{ c.slug }}</span>
        <span class="route-badge" :title="c.route">{{ routeBadge(c.route) }}</span>
      </div>
      <div class="item-meta">
        <span class="task">{{ c.task?.slice(0, 60) || 'No description' }}</span>
      </div>
      <div class="item-bottom">
        <span class="time">{{ formatTime(c.updated_at) }}</span>
        <span v-if="c.score != null" class="score">{{ c.score.toFixed(1) }}/10</span>
        <span v-if="c.tokens?.total" class="tokens">{{ (c.tokens.total / 1000).toFixed(0) }}K tok</span>
      </div>
    </div>
    <div v-if="!campaigns.length" class="empty">No campaigns yet</div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.campaign-list {
  width: 280px;
  flex-shrink: 0;
  overflow-y: auto;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  background: $bg-sidebar;
}

.list-header {
  padding: 12px 16px;
  font-size: 13px;
  font-weight: 600;
  color: $text-secondary;
  border-bottom: 1px solid $border-color;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.campaign-item {
  padding: 12px 16px;
  cursor: pointer;
  border-bottom: 1px solid rgba($border-color, 0.5);
  transition: background $transition-fast;

  &:hover { background: rgba($accent-primary, 0.04); }
  &.selected { background: rgba($accent-primary, 0.1); border-left: 3px solid $accent-primary; }
  &.active { border-left: 3px solid $success; }
}

.item-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.status-icon {
  font-size: 12px;
  width: 16px;
  text-align: center;
  &.status-active { color: $success; }
  &.status-completed { color: $accent-primary; }
  &.status-failed { color: $error; }
  &.status-abandoned { color: $text-muted; }
}

.slug {
  font-size: 13px;
  font-weight: 500;
  color: $text-primary;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.route-badge {
  font-size: 10px;
  font-weight: 700;
  background: rgba($accent-primary, 0.12);
  color: $accent-primary;
  padding: 1px 6px;
  border-radius: 4px;
}

.item-meta {
  .task {
    font-size: 12px;
    color: $text-secondary;
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.item-bottom {
  display: flex;
  gap: 8px;
  margin-top: 6px;
  font-size: 11px;
  color: $text-muted;

  .score { color: $accent-primary; font-weight: 600; }
  .tokens { color: $text-secondary; }
}

.empty {
  padding: 24px;
  text-align: center;
  color: $text-muted;
  font-size: 13px;
}
</style>
