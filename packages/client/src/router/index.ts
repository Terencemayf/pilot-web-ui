import { createRouter, createWebHashHistory } from 'vue-router'
import { hasApiKey } from '@/api/client'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/pilot/chat',
      name: 'pilot.chat',
      component: () => import('@/views/pilot/ChatView.vue'),
    },
    {
      path: '/pilot/jobs',
      name: 'pilot.jobs',
      component: () => import('@/views/pilot/JobsView.vue'),
    },
    {
      path: '/pilot/models',
      name: 'pilot.models',
      component: () => import('@/views/pilot/ModelsView.vue'),
    },
    {
      path: '/pilot/logs',
      name: 'pilot.logs',
      component: () => import('@/views/pilot/LogsView.vue'),
    },
    {
      path: '/pilot/usage',
      name: 'pilot.usage',
      component: () => import('@/views/pilot/UsageView.vue'),
    },
    {
      path: '/pilot/skills',
      name: 'pilot.skills',
      component: () => import('@/views/pilot/SkillsView.vue'),
    },
    {
      path: '/pilot/memory',
      name: 'pilot.memory',
      component: () => import('@/views/pilot/MemoryView.vue'),
    },
    {
      path: '/pilot/settings',
      name: 'pilot.settings',
      component: () => import('@/views/pilot/SettingsView.vue'),
    },
    {
      path: '/pilot/channels',
      name: 'pilot.channels',
      component: () => import('@/views/pilot/ChannelsView.vue'),
    },
    {
      path: '/pilot/pipeline',
      name: 'pilot.pipeline',
      component: () => import('@/views/pilot/PipelineView.vue'),
    },
    {
      path: '/pilot/terminal',
      name: 'pilot.terminal',
      component: () => import('@/views/pilot/TerminalView.vue'),
    },
  ],
})

router.beforeEach((to, _from, next) => {
  // Public pages don't need auth
  if (to.meta.public) {
    // Already has key, skip login
    if (to.name === 'login' && hasApiKey()) {
      next({ path: '/pilot/chat' })
      return
    }
    next()
    return
  }

  // All other pages require token
  if (!hasApiKey()) {
    next({ name: 'login' })
    return
  }

  next()
})

export default router
