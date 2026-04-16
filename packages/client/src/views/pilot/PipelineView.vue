<script setup lang="ts">
import { onMounted } from 'vue'
import { usePipelineStore } from '@/stores/pilot/pipeline'
import CampaignList from '@/components/pilot/pipeline/CampaignList.vue'
import CampaignDetail from '@/components/pilot/pipeline/CampaignDetail.vue'

const store = usePipelineStore()

onMounted(() => {
  store.fetchCampaigns()
})
</script>

<template>
  <div class="pipeline-view">
    <div class="pipeline-header">
      <h2>Pipeline Dashboard</h2>
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

  h2 { margin: 0; font-size: 20px; font-weight: 600; }

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
