<script setup lang="ts">
import { computed, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import ToolShell from '@/components/ToolShell.vue'
import { Button } from '@/components/ui/button'

type Kv = { key: string; value: string; enabled: boolean }
type BodyType = 'none' | 'json' | 'text' | 'form'
type ReqTab = 'params' | 'headers' | 'body'
type ResTab = 'body' | 'headers'

interface HttpResponse {
  ok: boolean
  status: number
  statusText: string
  headers: Kv[]
  body: string
  durationMs: number
  sizeBytes: number
  finalUrl: string
  error?: string | null
}

const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const

/** Common request header names (Postman-like suggestions) */
const COMMON_HEADER_NAMES = [
  'Accept',
  'Accept-Encoding',
  'Accept-Language',
  'Authorization',
  'Cache-Control',
  'Connection',
  'Content-Length',
  'Content-Type',
  'Cookie',
  'Location',
  'Origin',
  'Referer',
  'User-Agent',
  'X-Requested-With',
  'X-Request-Id',
  'X-Api-Key',
  'X-Access-Token',
  'X-CSRF-Token',
  'X-Forwarded-For',
  'X-Forwarded-Proto',
  'X-Real-IP',
  'If-None-Match',
  'If-Modified-Since',
  'Range',
  'Host',
] as const

/** Common values keyed by header name (case-insensitive) */
const COMMON_HEADER_VALUES: Record<string, string[]> = {
  accept: [
    'application/json',
    'application/xml',
    'text/plain',
    'text/html',
    '*/*',
  ],
  'content-type': [
    'application/json',
    'application/json; charset=utf-8',
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'text/plain',
    'text/xml',
  ],
  authorization: [
    'Bearer ',
    'Basic ',
    'Token ',
  ],
  'cache-control': [
    'no-cache',
    'no-store',
    'max-age=0',
  ],
  connection: [
    'keep-alive',
    'close',
  ],
  'accept-encoding': [
    'gzip, deflate, br',
    'gzip',
    'identity',
  ],
  'accept-language': [
    'zh-CN,zh;q=0.9,en;q=0.8',
    'en-US,en;q=0.9',
    '*',
  ],
  'x-requested-with': [
    'XMLHttpRequest',
  ],
}

function headerValueSuggestions(headerName: string): string[] {
  const key = headerName.trim().toLowerCase()
  if (!key)
    return []
  return COMMON_HEADER_VALUES[key] ?? []
}



const method = ref<(typeof methods)[number]>('GET')
const url = ref('https://httpbin.org/get')
const reqTab = ref<ReqTab>('params')
const resTab = ref<ResTab>('body')
const bodyType = ref<BodyType>('none')
const body = ref('')
const timeoutMs = ref(30000)
const loading = ref(false)
const error = ref('')
const response = ref<HttpResponse | null>(null)

const query = ref<Kv[]>([{ key: '', value: '', enabled: true }])
const headers = ref<Kv[]>([
  { key: 'Accept', value: 'application/json', enabled: true },
  { key: '', value: '', enabled: true },
])

const history = ref<Array<{ method: string; url: string; status: number; at: number }>>([])

function emptyKv(): Kv {
  return { key: '', value: '', enabled: true }
}

function addQueryRow() {
  query.value.push(emptyKv())
}

function removeQueryRow(idx: number) {
  if (query.value.length <= 1) {
    query.value = [emptyKv()]
    return
  }
  query.value.splice(idx, 1)
}

function addHeaderRow() {
  headers.value.push(emptyKv())
}

function removeHeaderRow(idx: number) {
  if (headers.value.length <= 1) {
    headers.value = [emptyKv()]
    return
  }
  headers.value.splice(idx, 1)
}

const quickHeaderChips = [
  'Authorization',
  'Content-Type',
  'Accept',
  'Cookie',
  'User-Agent',
  'Location',
  'X-Api-Key',
  'X-Request-Id',
] as const

function addPresetHeader(name: string) {
  const exists = headers.value.find(h => h.key.toLowerCase() === name.toLowerCase() && h.key.trim())
  if (exists) {
    // focus-like: ensure enabled
    exists.enabled = true
    if (!exists.value) {
      const vals = headerValueSuggestions(name)
      if (vals.length)
        exists.value = vals[0]
    }
    return
  }
  // fill first empty row if any
  const empty = headers.value.find(h => !h.key.trim())
  const vals = headerValueSuggestions(name)
  if (empty) {
    empty.key = name
    empty.enabled = true
    if (!empty.value && vals.length)
      empty.value = vals[0]
    return
  }
  headers.value.push({
    key: name,
    value: vals[0] ?? '',
    enabled: true,
  })
}

function onHeaderKeyPicked(idx: number) {
  const row = headers.value[idx]
  if (!row || !row.key.trim())
    return
  // normalize casing to known name when matched
  const hit = COMMON_HEADER_NAMES.find(n => n.toLowerCase() === row.key.trim().toLowerCase())
  if (hit)
    row.key = hit
  if (!row.value) {
    const vals = headerValueSuggestions(row.key)
    if (vals.length)
      row.value = vals[0]
  }
}

const statusClass = computed(() => {
  const s = response.value?.status ?? 0
  if (!response.value)
    return ''
  if (response.value.error || s === 0)
    return 'text-destructive'
  if (s >= 200 && s < 300)
    return 'text-emerald-600 dark:text-emerald-400'
  if (s >= 300 && s < 400)
    return 'text-amber-600 dark:text-amber-400'
  return 'text-destructive'
})

const sizeLabel = computed(() => {
  const n = response.value?.sizeBytes ?? 0
  if (n < 1024)
    return `${n} B`
  if (n < 1024 * 1024)
    return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
})
const bodyPlaceholder = computed(() => {
  if (bodyType.value === 'json')
    return '{\n  \"key\": \"value\"\n}'
  return 'request body...'
})

async function send() {
  error.value = ''
  response.value = null
  if (!url.value.trim()) {
    error.value = '请填写 URL'
    return
  }
  loading.value = true
  try {
    // auto set content-type helper for json if missing
    if (bodyType.value === 'json' && method.value !== 'GET' && method.value !== 'HEAD') {
      const hasCt = headers.value.some(h => h.enabled && h.key.toLowerCase() === 'content-type' && h.value)
      if (!hasCt) {
        const empty = headers.value.find(h => !h.key.trim())
        if (empty) {
          empty.key = 'Content-Type'
          empty.value = 'application/json'
          empty.enabled = true
        }
        else {
          headers.value.push({ key: 'Content-Type', value: 'application/json', enabled: true })
        }
      }
    }

    const res = await invoke<HttpResponse>('http_request', {
      input: {
        method: method.value,
        url: url.value.trim(),
        headers: headers.value,
        query: query.value,
        body: body.value,
        bodyType: bodyType.value,
        timeoutMs: timeoutMs.value,
      },
    })
    response.value = res
    if (res.error)
      error.value = res.error
    history.value.unshift({
      method: method.value,
      url: url.value.trim(),
      status: res.status,
      at: Date.now(),
    })
    if (history.value.length > 20)
      history.value.length = 20
    resTab.value = 'body'
  }
  catch (e) {
    error.value = String(e)
  }
  finally {
    loading.value = false
  }
}

async function copyResponse() {
  if (response.value?.body)
    await navigator.clipboard.writeText(response.value.body)
}

function loadHistory(item: { method: string; url: string }) {
  method.value = item.method as typeof method.value
  url.value = item.url
}

function onBodyTypeChange() {
  if (bodyType.value === 'json' && !body.value.trim()) {
    body.value = '{\n  \n}'
  }
}

function prettyBody() {
  try {
    body.value = JSON.stringify(JSON.parse(body.value), null, 2)
  }
  catch {
    error.value = 'Body 不是合法 JSON，无法格式化'
  }
}
</script>

<template>
  <ToolShell title="接口调试" desc="类 Postman：发 HTTP 请求、看状态码 / 耗时 / Headers / Body（无 CORS）">
    <div class="flex h-full min-h-0 flex-col gap-3">
      <!-- URL bar -->
      <div class="flex flex-wrap gap-2">
        <select
          v-model="method"
          class="h-9 w-[110px] rounded-md border border-input bg-background px-2 font-mono text-sm font-semibold"
        >
          <option v-for="m in methods" :key="m" :value="m">
            {{ m }}
          </option>
        </select>
        <input
          v-model="url"
          class="h-9 min-w-[220px] flex-1 rounded-md border border-input bg-background px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="https://api.example.com/v1/..."
          @keydown.enter.prevent="send"
        >
        <input
          v-model.number="timeoutMs"
          type="number"
          min="1000"
          step="1000"
          title="超时 (ms)"
          class="h-9 w-[110px] rounded-md border border-input bg-background px-2 font-mono text-sm"
        >
        <Button size="sm" class="min-w-[88px]" :disabled="loading" @click="send">
          {{ loading ? '发送中…' : 'Send' }}
        </Button>
      </div>

      <div class="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
        <!-- Request -->
        <div class="flex min-h-0 flex-col rounded-xl border border-border bg-card">
          <div class="flex items-center gap-1 border-b border-border px-2 pt-2">
            <button
              v-for="t in ([
                ['params', 'Params'],
                ['headers', 'Headers'],
                ['body', 'Body'],
              ] as const)"
              :key="t[0]"
              type="button"
              class="rounded-t-md px-3 py-2 text-sm"
              :class="reqTab === t[0] ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'"
              @click="reqTab = t[0]"
            >
              {{ t[1] }}
            </button>
          </div>

          <div class="min-h-0 flex-1 overflow-auto p-3">
            <div v-if="reqTab === 'params'" class="space-y-2">
              <div
                v-for="(row, idx) in query"
                :key="idx"
                class="grid grid-cols-[24px_1fr_1fr_32px] items-center gap-2"
              >
                <input v-model="row.enabled" type="checkbox" class="size-4">
                <input
                  v-model="row.key"
                  placeholder="Key"
                  class="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs"
                >
                <input
                  v-model="row.value"
                  placeholder="Value"
                  class="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs"
                >
                <Button type="button" size="sm" variant="ghost" class="h-8 px-2" @click.stop="removeQueryRow(idx)">
                  ×
                </Button>
              </div>
              <Button type="button" size="sm" variant="outline" @click.stop="addQueryRow()">
                + 参数
              </Button>
            </div>

            <div v-else-if="reqTab === 'headers'" class="space-y-2">
              <p class="text-xs text-muted-foreground">
                输入 Header 名时会提示常见项；Value 也会按 Header 给出常用值
              </p>
              <div
                v-for="(row, idx) in headers"
                :key="idx"
                class="grid grid-cols-[24px_1fr_1fr_32px] items-center gap-2"
              >
                <input v-model="row.enabled" type="checkbox" class="size-4">
                <input
                  v-model="row.key"
                  list="http-header-names"
                  placeholder="Header（可搜索）"
                  autocomplete="off"
                  class="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs"
                  @change="onHeaderKeyPicked(idx)"
                >
                <input
                  v-model="row.value"
                  :list="'http-header-values-' + idx"
                  placeholder="Value（可搜索）"
                  autocomplete="off"
                  class="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs"
                >
                <datalist :id="'http-header-values-' + idx">
                  <option
                    v-for="v in headerValueSuggestions(row.key)"
                    :key="v"
                    :value="v"
                  />
                </datalist>
                <Button type="button" size="sm" variant="ghost" class="h-8 px-2" @click.stop="removeHeaderRow(idx)">
                  ×
                </Button>
              </div>
              <datalist id="http-header-names">
                <option
                  v-for="name in COMMON_HEADER_NAMES"
                  :key="name"
                  :value="name"
                />
              </datalist>
              <div class="flex flex-wrap gap-1.5 pt-1">
                <button
                  v-for="name in quickHeaderChips"
                  :key="name"
                  type="button"
                  class="rounded-full border border-border bg-muted/40 px-2 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  @click="addPresetHeader(name)"
                >
                  {{ name }}
                </button>
              </div>
              <Button type="button" size="sm" variant="outline" @click.stop="addHeaderRow()">
                + Header
              </Button>
            </div>

            <div v-else class="space-y-2">
              <div class="flex flex-wrap items-center gap-2">
                <select
                  v-model="bodyType"
                  class="h-8 rounded-md border border-input bg-background px-2 text-sm"
                  @change="onBodyTypeChange"
                >
                  <option value="none">
                    none
                  </option>
                  <option value="json">
                    JSON
                  </option>
                  <option value="text">
                    raw text
                  </option>
                  <option value="form">
                    x-www-form-urlencoded
                  </option>
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  @click="prettyBody"
                >
                  格式化 JSON
                </Button>
              </div>
              <textarea
                v-if="bodyType !== 'none'"
                v-model="body"
                class="min-h-[260px] w-full resize-y rounded-md border border-input bg-background p-3 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                :placeholder="bodyPlaceholder"
              />
              <p v-else class="text-sm text-muted-foreground">
                当前无 Body（GET/HEAD 会忽略 Body）
              </p>
            </div>
          </div>
        </div>

        <!-- Response -->
        <div class="flex min-h-0 flex-col rounded-xl border border-border bg-card">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
            <div class="flex flex-wrap items-center gap-3 text-sm">
              <span class="font-mono font-semibold" :class="statusClass">
                <template v-if="response">
                  {{ response.status || '—' }} {{ response.statusText }}
                </template>
                <template v-else>
                  等待响应
                </template>
              </span>
              <span v-if="response" class="text-muted-foreground">
                {{ response.durationMs }} ms · {{ sizeLabel }}
              </span>
            </div>
            <div class="flex gap-1">
              <button
                type="button"
                class="rounded-md px-2 py-1 text-sm"
                :class="resTab === 'body' ? 'bg-muted font-medium' : 'text-muted-foreground'"
                @click="resTab = 'body'"
              >
                Body
              </button>
              <button
                type="button"
                class="rounded-md px-2 py-1 text-sm"
                :class="resTab === 'headers' ? 'bg-muted font-medium' : 'text-muted-foreground'"
                @click="resTab = 'headers'"
              >
                Headers
              </button>
              <Button size="sm" variant="ghost" :disabled="!response?.body" @click="copyResponse">
                复制
              </Button>
            </div>
          </div>

          <div class="min-h-0 flex-1 overflow-auto p-3">
            <p v-if="error" class="mb-2 text-sm text-destructive">
              ⚠ {{ error }}
            </p>
            <p v-if="response?.finalUrl" class="mb-2 break-all font-mono text-xs text-muted-foreground">
              {{ response.finalUrl }}
            </p>

            <pre
              v-if="resTab === 'body'"
              class="whitespace-pre-wrap break-all rounded-md border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed"
            >{{ response?.body || (loading ? '请求中…' : '—') }}</pre>

            <div v-else class="space-y-1">
              <div
                v-for="(h, i) in (response?.headers || [])"
                :key="i"
                class="grid grid-cols-[1fr_2fr] gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1.5 font-mono text-xs"
              >
                <span class="text-muted-foreground">{{ h.key }}</span>
                <span class="break-all">{{ h.value }}</span>
              </div>
              <p v-if="!response?.headers?.length" class="text-sm text-muted-foreground">
                —
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- History -->
      <div v-if="history.length" class="rounded-xl border border-border p-3">
        <div class="mb-2 text-xs font-medium text-muted-foreground">
          最近请求
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="(h, i) in history"
            :key="i"
            type="button"
            class="rounded-md border border-border bg-muted/30 px-2 py-1 font-mono text-xs hover:bg-muted"
            @click="loadHistory(h)"
          >
            <span class="font-semibold">{{ h.method }}</span>
            <span class="mx-1 text-muted-foreground">{{ h.status || 'ERR' }}</span>
            <span class="max-w-[220px] truncate align-bottom">{{ h.url }}</span>
          </button>
        </div>
      </div>
    </div>
  </ToolShell>
</template>
