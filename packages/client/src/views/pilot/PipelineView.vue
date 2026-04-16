<script setup lang="ts">
import { onMounted } from 'vue'
import { usePipelineStore } from '@/stores/pilot/pipeline'
import { usePipelineEvents } from '@/composables/usePipelineEvents'
import CampaignList from '@/components/pilot/pipeline/CampaignList.vue'
import CampaignDetail from '@/components/pilot/pipeline/CampaignDetail.vue'

const store = usePipelineStore()

// Real-time updates via WebSocket
const { connected } = usePipelineEvents((event) => {
  if (event.type === 'campaign.update') {
    // Refresh campaign list when any campaign changes
    store.fetchCampaigns()
    // If viewing this campaign, refresh detail too
    if (event.slug && event.slug === store.selectedSlug) {
      store.selectCampaign(event.slug)
    }
  }
})

onMounted(() => {
  store.fetchCampaigns()
})
</script>

<template>
  <div class="pipeline-view">
    <div class="pipeline-header">
      <h2>
        Pipeline Dashboard
        <span class="live-dot" v-if="connected" title="Live updates active"></span>
      </h2>
      <div class="pipeline-stats" v-if="store.campaigns.length">
        <span class="stat">{{ store.campaigns.length }} campaigns</span>
        <span class="stat">{{ store.completedCampaigns.length }} completed</span>
        <span class="stat" v-if="store.totalTokens > 0">
          {{ (store.totalTokens / 1000).toFixed(0) }}K tokens total
        </span>
      </div>
    </div>

    <div class="pipeline-content">
      <CampaignList
        :campaigns="store.campaigns"
        :active="store.activeCampaign"
        :selected-slug="store.selectedSlug"
        @select="store.selectCampaign"
        @delete="store.removeCampaign"
      />
      <CampaignDetail
        v-if="store.selectedCampaign"
        :campaign="store.selectedCampaign"
        :scorecard="store.selectedScorecard"
      />
      <div v-else class="empty-detail">
        <p>Select a campaign to view details</p>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.pipeline-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 24px;
  gap: 20px;
}

.pipeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;

  h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .live-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #22c55e;
    box-shadow: 0 0 6px rgba(34, 197, 94, 0.5);
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .pipeline-stats {
    display: flex;
    gap: 16px;
    .stat {
      font-size: 13px;
      color: $text-secondary;
      background: rgba($accent-primary, 0.06);
      padding: 4px 10px;
      border-radius: $radius-sm;
    }
  }
}

.pipeline-content {
  display: flex;
  flex: 1;
  gap: 20px;
  min-height: 0;
}

.empty-detail {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $text-muted;
  font-size: 14px;
}
</style>
