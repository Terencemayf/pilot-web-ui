<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { useAppStore } from '@/stores/pilot/app'
import { startRun, streamRunEvents, type RunEvent } from '@/api/pilot/chat'

const appStore = useAppStore()

interface ToolCall {
  id: string
  tool: string
  preview: string
  status: 'running' | 'done' | 'error'
  duration: number
}

interface Subagent {
  taskIndex: number
  goal: string
  status: 'running' | 'completed' | 'failed'
  tools: ToolCall[]
  thinking: string
  summary: string
  duration: number
  startedAt: number
}

interface CtoAction {
  id: string
  type: 'thinking' | 'tool' | 'delegate' | 'message'
  text: string
  tool?: string
  preview?: string
  subagent?: Subagent
  timestamp: number
}

const input = ref('')
const isRunning = ref(false)
const actions = ref<CtoAction[]>([])
const currentRunId = ref('')
const feedEl = ref<HTMLElement>()

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function scrollToBottom() {
  nextTick(() => {
    if (feedEl.value) feedEl.value.scrollTop = feedEl.value.scrollHeight
  })
}

function findSubagent(taskIndex: number): Subagent | undefined {
  // Find the most recent delegate action with this task index
  for (let i = actions.value.length - 1; i >= 0; i--) {
    const a = actions.value[i]
    if (a.type === 'delegate' && a.subagent?.taskIndex === taskIndex) {
      return a.subagent
    }
  }
  return undefined
}

async function send() {
  if (!input.value.trim() || isRunning.value) return

  const task = input.value.trim()
  input.value = ''
  isRunning.value = true
  actions.value = []

  actions.value.push({
    id: uid(), type: 'message', text: task, timestamp: Date.now()
  })

  try {
    const run = await startRun({
      input: task,
      cwd: appStore.projectDir || undefined,
    })
    currentRunId.value = (run as any).run_id || ''

    if (!currentRunId.value) {
      actions.value.push({ id: uid(), type: 'message', text: 'Error: no run ID', timestamp: Date.now() })
      isRunning.value = false
      return
    }

    streamRunEvents(
      currentRunId.value,
      (evt: RunEvent) => {
        const ts = Date.now()

        switch (evt.event) {
          case 'thinking':
            // Update or add thinking
            const lastThink = actions.value.filter(a => a.type === 'thinking').pop()
            if (lastThink && ts - lastThink.timestamp < 5000) {
              lastThink.text = (evt as any).text || ''
            } else {
              actions.value.push({ id: uid(), type: 'thinking', text: (evt as any).text || '', timestamp: ts })
            }
            scrollToBottom()
            break

          case 'tool.started':
            if (evt.tool === 'delegate_task') {
              // CTO delegating to subagent
              const sa: Subagent = {
                taskIndex: actions.value.filter(a => a.type === 'delegate').length,
                goal: evt.preview || '',
                status: 'running',
                tools: [],
                thinking: '',
                summary: '',
                duration: 0,
                startedAt: ts,
              }
              actions.value.push({
                id: uid(), type: 'delegate', text: evt.preview || 'Delegating...',
                tool: 'delegate_task', preview: evt.preview, subagent: sa, timestamp: ts,
              })
            } else {
              // CTO using a tool directly (todo, memory, etc.)
              actions.value.push({
                id: uid(), type: 'tool', text: evt.tool || '', tool: evt.tool,
                preview: evt.preview, timestamp: ts,
              })
            }
            scrollToBottom()
            break

          case 'tool.completed':
            // Mark CTO tool as done (not delegate — delegate has lifecycle)
            break

          case 'subagent.lifecycle': {
            const data = evt as any
            const status = data.status || 'started'
            if (status === 'started') {
              // Already handled by tool.started delegate_task
            } else {
              // Completed/failed
              const sa = findSubagent(data.task_index ?? 0)
              if (sa) {
                sa.status = status
                sa.summary = data.summary || ''
                sa.duration = data.duration || ((ts - sa.startedAt) / 1000)
              }
            }
            scrollToBottom()
            break
          }

          case 'subagent.tool.started': {
            const data = evt as any
            const sa = findSubagent(data.task_index ?? 0)
            if (sa) {
              sa.tools.push({
                id: uid(), tool: data.tool || '', preview: data.preview || '',
                status: 'running', duration: 0,
              })
              sa.thinking = '' // Clear thinking when tool starts
            }
            scrollToBottom()
            break
          }

          case 'subagent.tool.completed': {
            const data = evt as any
            const sa = findSubagent(data.task_index ?? 0)
            if (sa) {
              const t = sa.tools.filter(t => t.tool === data.tool && t.status === 'running').pop()
              if (t) {
                t.status = data.is_error ? 'error' : 'done'
                t.duration = data.duration || 0
              }
            }
            break
          }

          case 'subagent._thinking':
          case 'subagent.reasoning.available': {
            const data = evt as any
            const sa = findSubagent(data.task_index ?? 0)
            if (sa) sa.thinking = data.text || ''
            scrollToBottom()
            break
          }

          case 'message.delta': {
            const last = actions.value[actions.value.length - 1]
            if (last?.type === 'message' && last.text.startsWith('**CTO:**')) {
              last.text += evt.delta || ''
            } else {
              actions.value.push({
                id: uid(), type: 'message', text: '**CTO:** ' + (evt.delta || ''), timestamp: ts,
              })
            }
            scrollToBottom()
            break
          }

          case 'run.completed':
          case 'run.failed':
            isRunning.value = false
            scrollToBottom()
            break
        }
      },
      () => { isRunning.value = false },
      () => { isRunning.value = false },
    )
  } catch (e: any) {
    actions.value.push({ id: uid(), type: 'message', text: `Error: ${e.message}`, timestamp: Date.now() })
    isRunning.value = false
  }
}
</script>

<template>
  <div class="mission-control">
    <div class="mc-header">
      <h2>Mission Control</h2>
      <span class="mc-project" v-if="appStore.projectDir">
        {{ appStore.projectDir.split('/').pop() }}
      </span>
      <span class="mc-status" :class="{ running: isRunning }">
        {{ isRunning ? 'Running' : 'Idle' }}
      </span>
    </div>

    <!-- Activity Feed -->
    <div class="mc-feed" ref="feedEl">
      <div v-for="action in actions" :key="action.id" class="mc-action" :class="action.type">

        <!-- User message / CTO response -->
        <template v-if="action.type === 'message'">
          <div class="action-message">{{ action.text }}</div>
        </template>

        <!-- CTO thinking -->
        <template v-else-if="action.type === 'thinking'">
          <div class="action-thinking">
            <span class="think-icon">💭</span>
            <span>{{ action.text }}</span>
          </div>
        </template>

        <!-- CTO tool use (todo, memory, etc.) -->
        <template v-else-if="action.type === 'tool'">
          <div class="action-tool">
            <span class="tool-badge">{{ action.tool }}</span>
            <span class="tool-preview" v-if="action.preview">{{ action.preview }}</span>
          </div>
        </template>

        <!-- Delegation to subagent -->
        <template v-else-if="action.type === 'delegate' && action.subagent">
          <div class="action-delegate" :class="{ completed: action.subagent.status === 'completed', failed: action.subagent.status === 'failed' }">
            <div class="delegate-header">
              <span class="delegate-icon" :class="action.subagent.status">
                {{ action.subagent.status === 'completed' ? '✓' : action.subagent.status === 'failed' ? '✗' : '◉' }}
              </span>
              <span class="delegate-goal">{{ action.subagent.goal }}</span>
              <span class="delegate-duration" v-if="action.subagent.duration">
                {{ action.subagent.duration.toFixed(1) }}s
              </span>
            </div>

            <!-- Subagent thinking -->
            <div class="sa-thinking" v-if="action.subagent.thinking && action.subagent.status === 'running'">
              💭 {{ action.subagent.thinking }}
            </div>

            <!-- Subagent tool calls -->
            <div class="sa-tools" v-if="action.subagent.tools.length">
              <div v-for="t in action.subagent.tools" :key="t.id" class="sa-tool" :class="t.status">
                <span class="sa-tool-status">
                  {{ t.status === 'done' ? '✓' : t.status === 'error' ? '✗' : '⋯' }}
                </span>
                <span class="sa-tool-name">{{ t.tool }}</span>
                <span class="sa-tool-preview" v-if="t.preview">{{ t.preview }}</span>
                <span class="sa-tool-dur" v-if="t.duration">{{ t.duration.toFixed(1) }}s</span>
              </div>
            </div>

            <!-- Subagent summary -->
            <div class="sa-summary" v-if="action.subagent.summary">
              {{ action.subagent.summary }}
            </div>
          </div>
        </template>
      </div>

      <div v-if="isRunning && !actions.length" class="mc-waiting">
        Waiting for agent to start...
      </div>
    </div>

    <!-- Input -->
    <div class="mc-input">
      <input
        v-model="input"
        placeholder="Describe what you want to build..."
        @keyup.enter="send()"
        :disabled="isRunning"
      />
      <button @click="send()" :disabled="isRunning || !input.trim()">
        {{ isRunning ? 'Running...' : 'Go' }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.mission-control {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 20px;
  gap: 16px;
}

.mc-header {
  display: flex;
  align-items: center;
  gap: 12px;
  h2 { margin: 0; font-size: 18px; font-weight: 600; }
  .mc-project {
    font-size: 12px;
    background: rgba($accent-primary, 0.1);
    color: $accent-primary;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 500;
  }
  .mc-status {
    margin-left: auto;
    font-size: 12px;
    color: $text-muted;
    &.running { color: $success; font-weight: 600; }
  }
}

.mc-feed {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  background: #fafbfc;
}

.mc-waiting {
  color: $text-muted;
  font-size: 13px;
  text-align: center;
  padding: 40px;
}

// ── Action types ───────────────────────

.action-message {
  padding: 8px 12px;
  border-radius: $radius-sm;
  font-size: 13px;
  line-height: 1.5;
  background: #fff;
  border: 1px solid $border-color;
}

.action-thinking {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  font-size: 12px;
  color: $text-muted;
  font-style: italic;
  .think-icon { font-style: normal; }
}

.action-tool {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  font-size: 12px;
  .tool-badge {
    background: rgba(0,0,0,0.06);
    padding: 2px 8px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 11px;
  }
  .tool-preview { color: $text-secondary; }
}

// ── Delegation card ────────────────────

.action-delegate {
  border: 1px solid rgba($accent-primary, 0.2);
  border-left: 3px solid $accent-primary;
  border-radius: $radius-md;
  padding: 12px;
  background: #fff;
  transition: border-color 0.3s;

  &.completed { border-left-color: $success; }
  &.failed { border-left-color: $error; }
}

.delegate-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.delegate-icon {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 700;
  color: #fff;

  &.running { background: $accent-primary; animation: pulse 1.5s infinite; }
  &.completed { background: $success; }
  &.failed { background: $error; }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.delegate-goal {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: $text-primary;
}

.delegate-duration {
  font-size: 11px;
  color: $text-muted;
}

.sa-thinking {
  padding: 4px 8px 4px 28px;
  font-size: 11px;
  color: $text-muted;
  font-style: italic;
}

.sa-tools {
  padding-left: 28px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sa-tool {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  padding: 2px 0;
  color: $text-secondary;

  &.running { color: $accent-primary; }
  &.error { color: $error; }
  &.done { color: $text-muted; }

  .sa-tool-status { width: 14px; text-align: center; }
  .sa-tool-name { font-family: monospace; font-weight: 500; min-width: 80px; }
  .sa-tool-preview {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: $text-muted;
    font-size: 10px;
  }
  .sa-tool-dur { font-size: 10px; color: $text-muted; }
}

.sa-summary {
  padding: 6px 8px 0 28px;
  font-size: 12px;
  color: $text-secondary;
  border-top: 1px dashed rgba($border-color, 0.5);
  margin-top: 6px;
}

// ── Input ──────────────────────────────

.mc-input {
  display: flex;
  gap: 8px;

  input {
    flex: 1;
    padding: 10px 14px;
    border: 1px solid $border-color;
    border-radius: $radius-md;
    font-size: 14px;
    outline: none;
    &:focus { border-color: $accent-primary; }
    &:disabled { background: #f5f5f5; }
  }

  button {
    padding: 10px 20px;
    border: none;
    background: $accent-primary;
    color: #fff;
    border-radius: $radius-md;
    font-weight: 600;
    cursor: pointer;
    &:disabled { opacity: 0.5; cursor: not-allowed; }
    &:hover:not(:disabled) { filter: brightness(1.1); }
  }
}
</style>
