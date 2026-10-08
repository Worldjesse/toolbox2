<script setup lang="ts">
import type { HttpBodyType, HttpCollectionState, HttpKeyValue, SavedHttpRequest } from './httpCollections'
import { ChevronDown, ChevronRight, Copy, CopyPlus, Download, Eraser, Folder, FolderPlus, Pencil, Save, Search, Trash2, X } from '@lucide/vue'
import { invoke } from '@tauri-apps/api/core'
import { save as saveFile } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import { computed, onMounted, ref } from 'vue'
import ToolShell from '@/components/ToolShell.vue'
import { Button } from '@/components/ui/button'
import { useToolDraft } from '@/composables/useToolDraft'
import { useSettingsStore } from '@/stores/settings'
import { buildHttpAiContext, httpAiExportFilename } from './httpAiExport'
import {
  cloneHttpKeyValues,
  emptyHttpCollection,
  filterHttpRequests,

  normalizeHttpCollection,
  requestCountForGroup,

} from './httpCollections'

type Kv = HttpKeyValue
type BodyType = HttpBodyType
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
  truncated: boolean
  finalUrl: string
  error?: string | null
}

interface AiExportMetadata {
  environment: string
  service: string
  commitId: string
}

const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const
const COLLECTIONS_KEY = 'http.collections'
const AI_EXPORT_META_KEY = 'http.aiExportMetadata'
const HISTORY_LIMIT = 5
const RESPONSE_RENDER_LIMIT = 200_000
const settings = useSettingsStore()

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
  'accept': [
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
  'authorization': [
    'Bearer ',
    'Basic ',
    'Token ',
  ],
  'cache-control': [
    'no-cache',
    'no-store',
    'max-age=0',
  ],
  'connection': [
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

const method = useToolDraft<(typeof methods)[number]>('http', 'method', 'GET')
const url = ref('https://httpbin.org/get')
const reqTab = useToolDraft<ReqTab>('http', 'requestTab', 'params')
const resTab = useToolDraft<ResTab>('http', 'responseTab', 'body')
const bodyType = useToolDraft<BodyType>('http', 'bodyType', 'none')
const body = ref('')
const timeoutMs = useToolDraft('http', 'timeoutMs', 30000)
const loading = ref(false)
const error = ref('')
const response = ref<HttpResponse | null>(null)
const responseContent = ref<HTMLElement | null>(null)
const selectedResponseText = ref('')
const exportStatus = ref('')
const exportDialogOpen = ref(false)
const exportTestDate = ref(new Date().toLocaleDateString('en-CA'))
const exportEnvironment = ref('project3')
const exportService = ref('api-oms')
const exportCommitId = ref('')
const exportNotes = ref('')
const exportDialogError = ref('')
const exportingContext = ref(false)
const responseBodyPreview = computed(() => {
  const content = response.value?.body ?? ''
  return content.length > RESPONSE_RENDER_LIMIT
    ? `${content.slice(0, RESPONSE_RENDER_LIMIT)}\n\n[仅显示前 200,000 个字符，可使用“复制全部”获取已接收的完整内容]`
    : content
})
const responsePreviewTruncated = computed(() => Boolean(
  response.value?.truncated || (response.value?.body.length ?? 0) > RESPONSE_RENDER_LIMIT,
))

const query = ref<Kv[]>([{ key: '', value: '', enabled: true }])
const headers = ref<Kv[]>([
  { key: 'Accept', value: 'application/json', enabled: true },
  { key: '', value: '', enabled: true },
])

const history = ref<Array<{ method: string, url: string, status: number, at: number }>>([])
const collections = ref<HttpCollectionState>(emptyHttpCollection())
const activeRequestId = ref('')
const expandedGroups = ref(new Set<string>())
const collectionSearch = ref('')
const collectionStatus = ref('')
const saveDialogOpen = ref(false)
const saveName = ref('')
const saveGroupId = ref('')
const saveDialogError = ref('')
const savingRequest = ref(false)
const saveMode = ref<'create' | 'update'>('create')
const groupDialogOpen = ref(false)
const editingGroupId = ref('')
const groupName = ref('')
const pendingDelete = ref<{ kind: 'group' | 'request', id: string, name: string, count: number } | null>(null)

const filteredRequests = computed(() => filterHttpRequests(collections.value.requests, collectionSearch.value))
const activeRequest = computed(() => collections.value.requests.find(item => item.id === activeRequestId.value))
const visibleGroups = computed(() => collections.value.groups.filter(group => (
  !collectionSearch.value.trim()
  || group.name.toLocaleLowerCase().includes(collectionSearch.value.trim().toLocaleLowerCase())
  || filteredRequests.value.some(request => request.groupId === group.id)
)))

onMounted(async () => {
  try {
    collections.value = normalizeHttpCollection(await settings.getSetting<HttpCollectionState>(COLLECTIONS_KEY))
    expandedGroups.value = new Set(collections.value.groups.map(group => group.id))
  }
  catch (cause) {
    collectionStatus.value = `读取接口集合失败：${errorMessage(cause)}`
  }
  try {
    const metadata = await settings.getSetting<AiExportMetadata>(AI_EXPORT_META_KEY)
    if (metadata) {
      exportEnvironment.value = metadata.environment || exportEnvironment.value
      exportService.value = metadata.service || exportService.value
      exportCommitId.value = metadata.commitId || ''
    }
  }
  catch (cause) {
    exportStatus.value = `读取导出配置失败：${errorMessage(cause)}`
  }
})

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
  exportStatus.value = ''
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
    if (history.value.length > HISTORY_LIMIT)
      history.value.length = HISTORY_LIMIT
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

function openExportDialog() {
  if (!response.value)
    return
  exportTestDate.value = new Date().toLocaleDateString('en-CA')
  exportNotes.value = ''
  exportDialogError.value = ''
  exportDialogOpen.value = true
}

function closeExportDialog() {
  exportDialogOpen.value = false
  exportDialogError.value = ''
}

async function exportAiContext() {
  if (!response.value)
    return
  if (!exportTestDate.value || !exportEnvironment.value.trim() || !exportService.value.trim() || !exportCommitId.value.trim()) {
    exportDialogError.value = '请填写测试日期、部署环境、服务/仓库和部署提交 ID'
    return
  }
  exportStatus.value = ''
  exportDialogError.value = ''
  exportingContext.value = true
  try {
    const path = await saveFile({
      defaultPath: httpAiExportFilename(url.value),
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })
    if (!path)
      return
    const markdown = buildHttpAiContext({
      evidence: {
        testDate: exportTestDate.value,
        environment: exportEnvironment.value.trim(),
        service: exportService.value.trim(),
        commitId: exportCommitId.value.trim(),
        notes: exportNotes.value.trim(),
      },
      method: method.value,
      url: response.value.finalUrl || url.value.trim(),
      timeoutMs: timeoutMs.value,
      query: query.value,
      requestHeaders: headers.value,
      bodyType: bodyType.value,
      requestBody: body.value,
      response: response.value,
    })
    await writeTextFile(path, markdown)
    try {
      await settings.setSetting<AiExportMetadata>(AI_EXPORT_META_KEY, {
        environment: exportEnvironment.value.trim(),
        service: exportService.value.trim(),
        commitId: exportCommitId.value.trim(),
      })
    }
    catch {
      // The evidence file is already saved; metadata persistence is best-effort.
    }
    closeExportDialog()
    exportStatus.value = `AI 上下文已导出：${path}`
  }
  catch (cause) {
    exportDialogError.value = `导出失败：${errorMessage(cause)}`
  }
  finally {
    exportingContext.value = false
  }
}

function updateSelectedResponseText() {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || !selection.rangeCount || !responseContent.value) {
    selectedResponseText.value = ''
    return
  }

  const range = selection.getRangeAt(0)
  selectedResponseText.value = responseContent.value.contains(range.commonAncestorContainer)
    ? selection.toString()
    : ''
}

async function copySelectedResponse() {
  if (selectedResponseText.value)
    await navigator.clipboard.writeText(selectedResponseText.value)
}

function loadHistory(item: { method: string, url: string }) {
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

function errorMessage(cause: unknown) {
  const message = String(cause)
  return message.startsWith('Error: ') ? message.slice(7) : message
}

async function persistCollections(status: string) {
  const snapshot = JSON.parse(JSON.stringify(collections.value)) as HttpCollectionState
  await settings.setSetting(COLLECTIONS_KEY, snapshot)
  collectionStatus.value = status
}

function defaultRequestName() {
  try {
    const parsed = new URL(url.value.trim())
    const path = parsed.pathname.split('/').filter(Boolean).at(-1)
    return path || parsed.hostname
  }
  catch {
    return `${method.value} 请求`
  }
}

function createGroup() {
  editingGroupId.value = ''
  groupName.value = ''
  groupDialogOpen.value = true
}

function renameGroup(groupId: string) {
  const group = collections.value.groups.find(item => item.id === groupId)
  if (!group)
    return
  editingGroupId.value = groupId
  groupName.value = group.name
  groupDialogOpen.value = true
}

async function saveGroup() {
  const name = groupName.value.trim()
  if (!name)
    return
  if (collections.value.groups.some(group => group.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    const sameGroup = collections.value.groups.find(group => group.id === editingGroupId.value)?.name === name
    if (sameGroup) {
      groupDialogOpen.value = false
      return
    }
    collectionStatus.value = '已存在同名分组，请换一个名称'
    return
  }
  if (editingGroupId.value) {
    const group = collections.value.groups.find(item => item.id === editingGroupId.value)
    if (group)
      group.name = name
    groupDialogOpen.value = false
    await persistCollections(`分组已重命名为“${name}”`)
    return
  }
  const group = { id: crypto.randomUUID(), name, createdAt: Date.now() }
  collections.value.groups.push(group)
  expandedGroups.value = new Set([...expandedGroups.value, group.id])
  saveGroupId.value = group.id
  groupDialogOpen.value = false
  await persistCollections(`已创建分组“${name}”`)
}

function removeGroup(groupId: string) {
  const group = collections.value.groups.find(item => item.id === groupId)
  if (!group)
    return
  pendingDelete.value = {
    kind: 'group',
    id: groupId,
    name: group.name,
    count: requestCountForGroup(collections.value.requests, groupId),
  }
}

function toggleGroup(groupId: string) {
  const next = new Set(expandedGroups.value)
  if (next.has(groupId))
    next.delete(groupId)
  else
    next.add(groupId)
  expandedGroups.value = next
}

function clearRequest() {
  activeRequestId.value = ''
  method.value = 'GET'
  url.value = ''
  timeoutMs.value = 30000
  query.value = [emptyKv()]
  headers.value = [
    { key: 'Accept', value: 'application/json', enabled: true },
    emptyKv(),
  ]
  bodyType.value = 'none'
  body.value = ''
  response.value = null
  error.value = ''
  collectionStatus.value = '已清空请求编辑区'
}

function loadSavedRequest(saved: SavedHttpRequest) {
  activeRequestId.value = saved.id
  method.value = saved.method as typeof method.value
  url.value = saved.url
  timeoutMs.value = saved.timeoutMs
  query.value = cloneHttpKeyValues(saved.query.length ? saved.query : [emptyKv()])
  headers.value = cloneHttpKeyValues(saved.headers.length ? saved.headers : [emptyKv()])
  bodyType.value = saved.bodyType
  body.value = saved.body
  response.value = null
  error.value = ''
  collectionStatus.value = `已载入“${saved.name}”`
}

function ensureDefaultGroup() {
  if (collections.value.groups.length)
    return collections.value.groups[0].id
  const group = { id: crypto.randomUUID(), name: '默认分组', createdAt: Date.now() }
  collections.value.groups.push(group)
  expandedGroups.value = new Set([group.id])
  return group.id
}

function openSaveDialog(mode: 'create' | 'update') {
  const current = activeRequest.value
  if (mode === 'update' && !current)
    return
  saveMode.value = mode
  saveName.value = mode === 'update' ? current?.name ?? defaultRequestName() : defaultRequestName()
  saveGroupId.value = current?.groupId ?? collections.value.groups[0]?.id ?? '__default__'
  saveDialogError.value = ''
  saveDialogOpen.value = true
}

function closeSaveDialog() {
  saveDialogOpen.value = false
  saveDialogError.value = ''
}

async function saveRequestFromDialog() {
  const name = saveName.value.trim()
  if (!name || !saveGroupId.value) {
    saveDialogError.value = '请填写接口名称并选择分组'
    return
  }
  saveDialogError.value = ''
  savingRequest.value = true
  const previousRequests = collections.value.requests
  const previousActiveRequestId = activeRequestId.value
  const previousGroups = [...collections.value.groups]
  const targetGroupId = saveGroupId.value === '__default__' ? ensureDefaultGroup() : saveGroupId.value
  const id = saveMode.value === 'update' && activeRequestId.value ? activeRequestId.value : crypto.randomUUID()
  const saved: SavedHttpRequest = {
    id,
    groupId: targetGroupId,
    name,
    method: method.value,
    url: url.value.trim(),
    timeoutMs: timeoutMs.value,
    query: cloneHttpKeyValues(query.value),
    headers: cloneHttpKeyValues(headers.value),
    bodyType: bodyType.value,
    body: body.value,
    updatedAt: Date.now(),
  }
  collections.value.requests = [
    saved,
    ...collections.value.requests.filter(item => item.id !== id),
  ]
  activeRequestId.value = id
  expandedGroups.value = new Set([...expandedGroups.value, saved.groupId])
  try {
    await persistCollections(saveMode.value === 'update' ? `已更新接口“${name}”` : `已另存为接口“${name}”`)
    closeSaveDialog()
  }
  catch (cause) {
    collections.value.requests = previousRequests
    collections.value.groups = previousGroups
    activeRequestId.value = previousActiveRequestId
    saveDialogError.value = `保存失败：${errorMessage(cause)}`
  }
  finally {
    savingRequest.value = false
  }
}

function removeSavedRequest(saved: SavedHttpRequest) {
  pendingDelete.value = { kind: 'request', id: saved.id, name: saved.name, count: 0 }
}

async function confirmDelete() {
  const target = pendingDelete.value
  if (!target)
    return
  if (target.kind === 'group') {
    collections.value.groups = collections.value.groups.filter(item => item.id !== target.id)
    collections.value.requests = collections.value.requests.filter(item => item.groupId !== target.id)
    if (activeRequest.value?.groupId === target.id)
      activeRequestId.value = ''
    pendingDelete.value = null
    await persistCollections(`已删除分组“${target.name}”`)
    return
  }
  collections.value.requests = collections.value.requests.filter(item => item.id !== target.id)
  if (activeRequestId.value === target.id)
    activeRequestId.value = ''
  pendingDelete.value = null
  await persistCollections(`已删除接口“${target.name}”`)
}

function requestsInGroup(groupId: string) {
  return filteredRequests.value.filter(request => request.groupId === groupId)
}

function methodClass(value: string) {
  if (value === 'GET')
    return 'text-emerald-600 dark:text-emerald-400'
  if (value === 'POST')
    return 'text-amber-600 dark:text-amber-400'
  if (value === 'DELETE')
    return 'text-destructive'
  return 'text-sky-600 dark:text-sky-400'
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
        <Button size="sm" variant="outline" class="gap-2" title="保留当前配置并另存为新接口" @click="openSaveDialog('create')">
          <CopyPlus class="size-4" />
          另存为
        </Button>
        <Button size="sm" variant="outline" class="gap-2" title="覆盖当前选中的接口" :disabled="!activeRequest" @click="openSaveDialog('update')">
          <Save class="size-4" />
          更新
        </Button>
        <Button size="sm" variant="ghost" class="size-8 p-0" title="清空请求编辑区" @click="clearRequest">
          <Eraser class="size-4" />
        </Button>
        <Button size="sm" class="min-w-[88px]" :disabled="loading" @click="send">
          {{ loading ? '发送中…' : 'Send' }}
        </Button>
      </div>

      <div class="grid min-h-0 flex-1 gap-3 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside class="flex max-h-72 min-h-0 flex-col overflow-hidden rounded-md border border-border bg-background xl:max-h-none">
          <div class="border-b border-border p-3">
            <div class="mb-2 flex items-center justify-between gap-2">
              <div>
                <div class="text-sm font-semibold">
                  接口集合
                </div>
                <div class="mt-0.5 text-[11px] text-muted-foreground">
                  {{ collections.groups.length }} 个分组 · {{ collections.requests.length }} 个接口
                </div>
              </div>
              <Button size="sm" variant="ghost" class="size-8 p-0" title="新建分组" @click="createGroup">
                <FolderPlus class="size-4" />
              </Button>
            </div>
            <div class="relative">
              <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input v-model="collectionSearch" placeholder="搜索名称、URL 或方法" class="h-9 w-full rounded-md border border-input bg-background pl-8 pr-8 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <button v-if="collectionSearch" type="button" title="清除搜索" class="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded hover:bg-muted" @click="collectionSearch = ''">
                <X class="size-3.5" />
              </button>
            </div>
          </div>

          <div class="min-h-0 flex-1 overflow-auto p-2">
            <div v-if="!collections.groups.length" class="grid min-h-40 place-items-center px-4 text-center text-xs text-muted-foreground">
              <div>
                <Folder class="mx-auto mb-2 size-6 opacity-50" />
                保存当前请求后，会自动创建默认分组
              </div>
            </div>
            <div v-else-if="!visibleGroups.length" class="grid min-h-40 place-items-center px-4 text-center text-xs text-muted-foreground">
              没有匹配的接口
            </div>
            <div v-for="group in visibleGroups" :key="group.id" class="mb-1">
              <div class="group flex items-center gap-0.5 rounded hover:bg-muted/70">
                <button type="button" class="flex h-8 min-w-0 flex-1 items-center gap-1.5 px-1.5 text-left text-xs font-medium" @click="toggleGroup(group.id)">
                  <ChevronDown v-if="expandedGroups.has(group.id) || collectionSearch" class="size-3.5 shrink-0 text-muted-foreground" />
                  <ChevronRight v-else class="size-3.5 shrink-0 text-muted-foreground" />
                  <Folder class="size-4 shrink-0 text-amber-500" />
                  <span class="min-w-0 flex-1 truncate">{{ group.name }}</span>
                  <span class="text-[10px] text-muted-foreground">{{ requestCountForGroup(collections.requests, group.id) }}</span>
                </button>
                <button type="button" class="grid size-7 shrink-0 place-items-center rounded opacity-0 hover:bg-background group-hover:opacity-100 focus:opacity-100" title="重命名分组" @click="renameGroup(group.id)">
                  <Pencil class="size-3.5" />
                </button>
                <button type="button" class="grid size-7 shrink-0 place-items-center rounded text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus:opacity-100" title="删除分组" @click="removeGroup(group.id)">
                  <Trash2 class="size-3.5" />
                </button>
              </div>
              <div v-if="expandedGroups.has(group.id) || collectionSearch" class="ml-4 border-l border-border pl-1.5">
                <div v-for="saved in requestsInGroup(group.id)" :key="saved.id" class="group/request flex items-center rounded" :class="activeRequestId === saved.id ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/70'">
                  <button type="button" class="flex h-9 min-w-0 flex-1 items-center gap-2 px-2 text-left" :title="`${saved.method} ${saved.url}`" @click="loadSavedRequest(saved)">
                    <span class="w-10 shrink-0 font-mono text-[10px] font-bold" :class="methodClass(saved.method)">{{ saved.method }}</span>
                    <span class="min-w-0 flex-1 truncate text-xs">{{ saved.name }}</span>
                  </button>
                  <button type="button" class="grid size-7 shrink-0 place-items-center rounded text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover/request:opacity-100 focus:opacity-100" title="删除接口" @click="removeSavedRequest(saved)">
                    <Trash2 class="size-3.5" />
                  </button>
                </div>
                <div v-if="!requestsInGroup(group.id).length" class="px-2 py-2 text-[11px] text-muted-foreground">
                  {{ collectionSearch ? '无匹配接口' : '空分组' }}
                </div>
              </div>
            </div>
          </div>
          <div v-if="collectionStatus" class="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            {{ collectionStatus }}
          </div>
        </aside>

        <div class="grid min-h-0 gap-3 lg:grid-cols-2">
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
                    :list="`http-header-values-${idx}`"
                    placeholder="Value（可搜索）"
                    autocomplete="off"
                    class="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs"
                  >
                  <datalist :id="`http-header-values-${idx}`">
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
                <Button size="sm" variant="ghost" class="gap-1.5" :disabled="!selectedResponseText" title="复制鼠标选中的响应文本" @click="copySelectedResponse">
                  <Copy class="size-3.5" />
                  复制选中
                </Button>
                <Button size="sm" variant="ghost" :disabled="!response?.body" title="复制完整响应 Body" @click="copyResponse">
                  复制全部
                </Button>
                <Button size="sm" variant="ghost" class="gap-1.5" :disabled="!response" title="导出脱敏后的请求、响应和联调证据，供 AI 工具参考" @click="openExportDialog">
                  <Download class="size-3.5" />
                  导出 AI 上下文
                </Button>
              </div>
            </div>

            <div
              ref="responseContent"
              data-testid="http-response-content"
              class="response-selectable min-h-0 flex-1 overflow-auto p-3"
              @keyup="updateSelectedResponseText"
              @mouseup="updateSelectedResponseText"
            >
              <p v-if="error" class="mb-2 text-sm text-destructive">
                ⚠ {{ error }}
              </p>
              <p v-if="response?.finalUrl" class="mb-2 break-all font-mono text-xs text-muted-foreground">
                {{ response.finalUrl }}
              </p>
              <p v-if="exportStatus" class="mb-2 break-all rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                {{ exportStatus }}
              </p>
              <p v-if="responsePreviewTruncated" class="mb-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                响应内容较大，已限制读取或界面预览，避免长时间占用过多内存。
              </p>

              <pre
                v-if="resTab === 'body'"
                class="whitespace-pre-wrap break-all rounded-md border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed"
              >{{ responseBodyPreview || (loading ? '请求中…' : '—') }}</pre>

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
      </div>

      <!-- History -->
      <div v-if="history.length" data-testid="recent-requests" class="flex h-[230px] shrink-0 flex-col rounded-xl border border-border p-3">
        <div class="mb-2 shrink-0 text-xs font-medium text-muted-foreground">
          最近请求
        </div>
        <div class="min-h-0 flex-1 overflow-auto">
          <div class="flex flex-wrap content-start gap-2">
            <button
              v-for="(h, i) in history"
              :key="i"
              type="button"
              data-testid="recent-request"
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

      <div v-if="groupDialogOpen" data-testid="group-dialog-overlay" class="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
        <section class="w-full max-w-sm rounded-md border border-border bg-background shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="group-dialog-title">
          <div class="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 id="group-dialog-title" class="text-sm font-semibold">
              {{ editingGroupId ? '重命名分组' : '新建分组' }}
            </h2>
            <Button size="sm" variant="ghost" class="size-8 p-0" title="关闭" @click="groupDialogOpen = false">
              <X class="size-4" />
            </Button>
          </div>
          <div class="p-4">
            <label class="grid gap-1.5 text-xs font-medium">
              分组名称
              <input v-model="groupName" autofocus class="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="例如：OMS 项目" @keydown.enter.prevent="saveGroup">
            </label>
          </div>
          <div class="flex justify-end gap-2 border-t border-border px-4 py-3">
            <Button size="sm" variant="outline" @click="groupDialogOpen = false">
              取消
            </Button>
            <Button size="sm" :disabled="!groupName.trim()" @click="saveGroup">
              {{ editingGroupId ? '保存' : '创建' }}
            </Button>
          </div>
        </section>
      </div>

      <div v-if="pendingDelete" data-testid="delete-dialog-overlay" class="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
        <section class="w-full max-w-sm rounded-md border border-border bg-background shadow-2xl" role="alertdialog" aria-modal="true" aria-labelledby="delete-dialog-title">
          <div class="border-b border-border px-4 py-3">
            <h2 id="delete-dialog-title" class="text-sm font-semibold">
              确认删除{{ pendingDelete.kind === 'group' ? '分组' : '接口' }}
            </h2>
          </div>
          <div class="p-4 text-sm">
            <p>“{{ pendingDelete.name }}”删除后无法恢复。</p>
            <p v-if="pendingDelete.kind === 'group' && pendingDelete.count" class="mt-2 text-xs text-destructive">
              该分组中的 {{ pendingDelete.count }} 个接口也会一并删除。
            </p>
          </div>
          <div class="flex justify-end gap-2 border-t border-border px-4 py-3">
            <Button size="sm" variant="outline" @click="pendingDelete = null">
              取消
            </Button>
            <Button size="sm" variant="destructive" class="gap-2" @click="confirmDelete">
              <Trash2 class="size-4" />
              删除
            </Button>
          </div>
        </section>
      </div>

      <div v-if="saveDialogOpen" data-testid="save-dialog-overlay" class="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
        <section class="w-full max-w-md rounded-md border border-border bg-background shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="save-http-title">
          <div class="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 id="save-http-title" class="text-sm font-semibold">
                {{ saveMode === 'update' ? '更新已保存接口' : '另存为新接口' }}
              </h2>
              <p class="mt-0.5 text-xs text-muted-foreground">
                {{ saveMode === 'update' ? '覆盖当前接口的方法、URL、参数、Headers 和 Body' : '保留当前配置，创建一条新的接口记录' }}
              </p>
            </div>
            <Button type="button" size="sm" variant="ghost" class="size-8 p-0" title="关闭" @click.stop="closeSaveDialog">
              <X class="size-4" />
            </Button>
          </div>
          <div class="grid gap-4 p-4">
            <label class="grid gap-1.5 text-xs font-medium">
              接口名称
              <input v-model="saveName" autofocus class="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="例如：查询店铺权限" @keydown.enter.prevent="saveRequestFromDialog">
            </label>
            <label class="grid gap-1.5 text-xs font-medium">
              所属分组
              <select v-model="saveGroupId" class="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal">
                <option v-if="!collections.groups.length" value="__default__">
                  默认分组（保存时创建）
                </option>
                <option v-for="group in collections.groups" :key="group.id" :value="group.id">
                  {{ group.name }}
                </option>
              </select>
            </label>
            <p v-if="saveDialogError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {{ saveDialogError }}
            </p>
          </div>
          <div class="flex justify-end gap-2 border-t border-border px-4 py-3">
            <Button type="button" size="sm" variant="outline" :disabled="savingRequest" @click.stop="closeSaveDialog">
              取消
            </Button>
            <Button type="button" size="sm" class="gap-2" :disabled="savingRequest || !saveName.trim() || !saveGroupId" @click.stop="saveRequestFromDialog">
              <Save class="size-4" />
              {{ savingRequest ? '保存中…' : saveMode === 'update' ? '更新' : '另存为' }}
            </Button>
          </div>
        </section>
      </div>

      <div v-if="exportDialogOpen" data-testid="export-dialog-overlay" class="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
        <section class="w-full max-w-lg rounded-md border border-border bg-background shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="export-ai-title">
          <div class="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 id="export-ai-title" class="text-sm font-semibold">
                导出 AI 联调证据
              </h2>
              <p class="mt-0.5 text-xs text-muted-foreground">
                自动包含完整请求、状态码和脱敏后的原始响应 JSON
              </p>
            </div>
            <Button type="button" size="sm" variant="ghost" class="size-8 p-0" title="关闭" :disabled="exportingContext" @click="closeExportDialog">
              <X class="size-4" />
            </Button>
          </div>
          <div class="grid gap-4 p-4 sm:grid-cols-2">
            <label class="grid gap-1.5 text-xs font-medium">
              测试日期
              <input v-model="exportTestDate" type="date" class="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring">
            </label>
            <label class="grid gap-1.5 text-xs font-medium">
              部署环境
              <input v-model="exportEnvironment" class="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="例如：project3">
            </label>
            <label class="grid gap-1.5 text-xs font-medium">
              服务 / 仓库
              <input v-model="exportService" class="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="例如：api-oms">
            </label>
            <label class="grid gap-1.5 text-xs font-medium">
              部署提交 ID
              <input v-model="exportCommitId" class="h-9 rounded-md border border-input bg-background px-3 font-mono text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="例如：9dfbf453c2e03a12486234303b2a6804d3f059d2">
            </label>
            <label class="grid gap-1.5 text-xs font-medium sm:col-span-2">
              证据说明
              <textarea v-model="exportNotes" rows="3" class="resize-none rounded-md border border-input bg-background px-3 py-2 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="例如：OFF_USE 响应，证明包含 8851、不包含 44。" />
            </label>
            <p v-if="exportDialogError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive sm:col-span-2">
              {{ exportDialogError }}
            </p>
          </div>
          <div class="flex justify-end gap-2 border-t border-border px-4 py-3">
            <Button type="button" size="sm" variant="outline" :disabled="exportingContext" @click="closeExportDialog">
              取消
            </Button>
            <Button type="button" size="sm" class="gap-2" :disabled="exportingContext || !exportTestDate || !exportEnvironment.trim() || !exportService.trim() || !exportCommitId.trim()" @click="exportAiContext">
              <Download class="size-4" />
              {{ exportingContext ? '导出中…' : '导出 Markdown' }}
            </Button>
          </div>
        </section>
      </div>
    </div>
  </ToolShell>
</template>
