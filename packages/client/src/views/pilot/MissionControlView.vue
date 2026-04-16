<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { useAppStore } from '@/stores/pilot/app'
import { startRun, streamRunEvents, type RunEvent } from '@/api/pilot/chat'

const appStore = useAppStore()

// ── File attachments ───────────────────────────────────
interface Attachment {
  id: string; name: string; type: string; size: number; url: string; file: File
}

const attachments = ref<Attachment[]>([])
const fileInputRef = ref<HTMLInputElement>()
const isDragging = ref(false)
const dragCounter = ref(0)

function addFile(file: File) {
  if (attachments.value.find(a => a.name === file.name)) return
  attachments.value.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: file.name, type: file.type, size: file.size,
    url: URL.createObjectURL(file), file,
  })
}

function removeAttachment(id: string) {
  const idx = attachments.value.findIndex(a => a.id === id)
  if (idx >= 0) { URL.revokeObjectURL(attachments.value[idx].url); attachments.value.splice(idx, 1) }
}

function handleFileChange(e: Event) {
  const el = e.target as HTMLInputElement
  if (el.files) for (const f of el.files) addFile(f)
  el.value = ''
}

function handlePaste(e: ClipboardEvent) {
  for (const item of Array.from(e.clipboardData?.items || [])) {
    if (!item.type.startsWith('image/')) continue
    e.preventDefault()
    const blob = item.getAsFile()
    if (blob) addFile(new File([blob], `pasted-${Date.now()}.${item.type.split('/')[1] || 'png'}`, { type: item.type }))
  }
}

function handleDrop(e: DragEvent) {
  e.preventDefault(); dragCounter.value = 0; isDragging.value = false
  for (const f of Array.from(e.dataTransfer?.files || [])) addFile(f)
}

async function uploadFiles(): Promise<{ name: string; path: string }[]> {
  if (!attachments.value.length) return []
  const fd = new FormData()
  for (const a of attachments.value) fd.append('file', a.file, a.name)
  const token = localStorage.getItem('pilot_api_key') || ''
  const res = await fetch('/upload', { method: 'POST', body: fd, headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
  return (await res.json()).files || []
}

function isImage(type: string) { return type.startsWith('image/') }
function formatSize(b: number) { return b < 1024 ? b + ' B' : b < 1048576 ? (b/1024).toFixed(1) + ' KB' : (b/1048576).toFixed(1) + ' MB' }

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
  if ((!input.value.trim() && !attachments.value.length) || isRunning.value) return

  const task = input.value.trim()
  input.value = ''
  isRunning.value = true
  actions.value = []

  // Upload attachments first
  let inputText = task
  const currentAttachments = [...attachments.value]
  attachments.value = []
  try {
    if (currentAttachments.length) {
      const uploaded = await uploadFiles()
      const paths = uploaded.map(f => `[File: ${f.name}](${f.path})`)
      inputText = inputText ? inputText + '\n\n' + paths.join('\n') : paths.join('\n')
    }
  } catch (e: any) {
    actions.value.push({ id: uid(), type: 'message', text: `Upload error: ${e.message}`, timestamp: Date.now() })
    isRunning.value = false
    return
  }

  actions.value.push({
    id: uid(), type: 'message', text: task || currentAttachments.map(a => a.name).join(', '),
    timestamp: Date.now()
  })

  try {
    const run = await startRun({
      input: inputText,
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
    <div class="mc-input-area">
      <!-- Attachment previews -->
      <div v-if="attachments.length" class="mc-attachments">
        <div v-for="a in attachments" :key="a.id" class="mc-att" :class="{ image: isImage(a.type) }">
          <img v-if="isImage(a.type)" :src="a.url" :alt="a.name" class="mc-att-thumb" />
          <div v-else class="mc-att-file">
            <span class="mc-att-name">{{ a.name }}</span>
            <span class="mc-att-size">{{ formatSize(a.size) }}</span>
          </div>
          <button class="mc-att-remove" @click="removeAttachment(a.id)">x</button>
        </div>
      </div>
      <div
        class="mc-input"
        :class="{ 'drag-over': isDragging }"
        @dragover.prevent
        @dragenter.prevent="dragCounter++; isDragging = true"
        @dragleave="dragCounter--; if (dragCounter <= 0) { dragCounter = 0; isDragging = false }"
        @drop="handleDrop"
      >
        <input ref="fileInputRef" type="file" multiple class="mc-file-hidden" @change="handleFileChange" />
        <button class="mc-attach-btn" @click="fileInputRef?.click()" :disabled="isRunning" title="Attach files">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
          </svg>
        </button>
        <input
          v-model="input"
          placeholder="Describe what you want to build..."
          @keyup.enter="send()"
          @paste="handlePaste"
          :disabled="isRunning"
        />
        <button @click="send()" :disabled="isRunning || (!input.trim() && !attachments.length)">
          {{ isRunning ? 'Running...' : 'Go' }}
        </button>
      </div>
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

// ── Input area ─────────────────────────

.mc-input-area { display: flex; flex-direction: column; gap: 8px; }

.mc-attachments {
  display: flex; flex-wrap: wrap; gap: 8px;
  .mc-att {
    position: relative; border-radius: $radius-sm; overflow: hidden;
    border: 1px solid $border-color; background: $bg-sidebar;
    &.image { width: 56px; height: 56px; }
    .mc-att-thumb { width: 100%; height: 100%; object-fit: cover; }
    .mc-att-file {
      padding: 6px 10px; display: flex; flex-direction: column; gap: 2px;
      .mc-att-name { font-size: 11px; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .mc-att-size { font-size: 10px; color: $text-muted; }
    }
    .mc-att-remove {
      position: absolute; top: 2px; right: 2px; width: 16px; height: 16px;
      border-radius: 50%; border: none; background: rgba(0,0,0,0.5); color: #fff;
      font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center;
      opacity: 0; transition: opacity 0.15s;
    }
    &:hover .mc-att-remove { opacity: 1; }
  }
}

.mc-file-hidden { display: none; }

.mc-input {
  display: flex; align-items: center; gap: 8px;
  border: 1px solid $border-color; border-radius: $radius-md;
  padding: 6px 8px; transition: border-color $transition-fast;
  &:focus-within { border-color: $accent-primary; }
  &.drag-over { border-color: $accent-primary; border-style: dashed; background: rgba($accent-primary, 0.03); }

  .mc-attach-btn {
    border: none; background: none; cursor: pointer; padding: 4px; color: $text-muted;
    border-radius: $radius-sm; display: flex; align-items: center;
    &:hover { background: rgba(0,0,0,0.04); color: $text-primary; }
    &:disabled { opacity: 0.4; cursor: not-allowed; }
  }

  input {
    flex: 1; padding: 6px 8px; border: none; outline: none;
    font-size: 14px; background: none;
    &:disabled { background: none; }
    &::placeholder { color: $text-muted; }
  }

  button:last-child {
    padding: 8px 18px; border: none; background: $accent-primary; color: #fff;
    border-radius: $radius-sm; font-weight: 600; cursor: pointer;
    &:disabled { opacity: 0.5; cursor: not-allowed; }
    &:hover:not(:disabled) { filter: brightness(1.1); }
  }
}
</style>
