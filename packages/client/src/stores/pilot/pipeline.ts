import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { PipelineCampaign, PipelineScorecard } from '@/api/pilot/pipeline'
import { listCampaigns, getCampaign, getScorecard, deleteCampaign } from '@/api/pilot/pipeline'

export const usePipelineStore = defineStore('pipeline', () => {
  const campaigns = ref<PipelineCampaign[]>([])
  const activeCampaign = ref<PipelineCampaign | null>(null)
  const selectedSlug = ref<string | null>(null)
  const selectedScorecard = ref<PipelineScorecard | null>(null)
  const loading = ref(false)

  const selectedCampaign = computed(() =>
    campaigns.value.find(c => c.slug === selectedSlug.value) ?? null
  )

  const completedCampaigns = computed(() =>
    campaigns.value.filter(c => c.status === 'completed')
  )

  const totalTokens = computed(() =>
    campaigns.value.reduce((sum, c) => sum + (c.tokens?.total ?? 0), 0)
  )

  async function fetchCampaigns() {
    loading.value = true
    try {
      const data = await listCampaigns()
      campaigns.value = data.campaigns
      activeCampaign.value = data.active
    } catch (e) {
      console.error('Failed to fetch campaigns:', e)
    } finally {
      loading.value = false
    }
  }

  async function selectCampaign(slug: string) {
    selectedSlug.value = slug
    try {
      const [campaign, scorecard] = await Promise.all([
        getCampaign(slug),
        getScorecard(slug),
      ])
      // Update in list
      const idx = campaigns.value.findIndex(c => c.slug === slug)
      if (idx >= 0) campaigns.value[idx] = campaign
      selectedScorecard.value = scorecard
    } catch (e) {
      console.error('Failed to fetch campaign details:', e)
    }
  }

  async function removeCampaign(slug: string) {
    try {
      await deleteCampaign(slug)
      campaigns.value = campaigns.value.filter(c => c.slug !== slug)
      if (selectedSlug.value === slug) {
        selectedSlug.value = null
        selectedScorecard.value = null
      }
    } catch (e) {
      console.error('Failed to delete campaign:', e)
    }
  }

  return {
    campaigns, activeCampaign, selectedSlug, selectedCampaign,
    selectedScorecard, loading, completedCampaigns, totalTokens,
    fetchCampaigns, selectCampaign, removeCampaign,
  }
})
