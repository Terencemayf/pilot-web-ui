<script setup lang="ts">
import { onMounted } from 'vue'
import ChatPanel from '@/components/pilot/chat/ChatPanel.vue'
import { useAppStore } from '@/stores/pilot/app'
import { useChatStore } from '@/stores/pilot/chat'

const appStore = useAppStore()
const chatStore = useChatStore()

onMounted(() => {
  appStore.loadModels()
  chatStore.loadSessions()
})
</script>

<template>
  <div class="chat-view">
    <ChatPanel />
  </div>
</template>

<style scoped lang="scss">
.chat-view {
  height: calc(100 * var(--vh));
  display: flex;
  flex-direction: column;
}
</style>
