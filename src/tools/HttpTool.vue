<script setup lang="ts">
import type { HttpAssertion, HttpAssertionResult, HttpAssertionType } from './httpAssertions'
import type { HttpAuth, HttpBodyType, HttpCollectionState, HttpCookie, HttpKeyValue, HttpMultipartPart, SavedHttpRequest } from './httpCollections'
import type { HttpExportFormat, HttpImportFormat } from './httpInterchange'
import type { HttpHistoryEntry, HttpRequestDraft, HttpWorkspaceState } from './httpWorkspace'
import { Braces, ChevronDown, ChevronRight, Copy, CopyPlus, Download, Eraser, FileUp, Folder, FolderPlus, History, Pencil, Plus, Save, Search, Settings2, Trash2, X } from '@lucide/vue'
import { invoke } from '@tauri-apps/api/core'
import { open as openFile, save as saveFile } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ToolShell from '@/components/ToolShell.vue'
import { Button } from '@/components/ui/button'
import { useToolDraft } from '@/composables/useToolDraft'
import { useSettingsStore } from '@/stores/settings'
import { buildHttpAiContext, httpAiExportFilename } from './httpAiExport'
import {
  emptyHttpAssertion,
  evaluateHttpAssertions,
  HTTP_ASSERTION_LABELS,
} from './httpAssertions'
import {
  cloneHttpAuth,
  cloneHttpCookies,
  cloneHttpKeyValues,
  cloneHttpMultipart,
  defaultHttpAuth,
  emptyHttpCollection,
  filterHttpRequests,

  normalizeHttpCollection,
  requestCountForGroup,

} from './httpCollections'
import {
  exportHttpProject,
  importHttpProject,
  mergeImportedHttpProject,
} from './httpInterchange'
import {
  captureResponseCookies,
  cloneHttpRequestDraft,
  cookiesForUrl,
  createHttpRequestTab,
  emptyHttpRequestDraft,
  emptyHttpWorkspace,
  interpolateHttpValue,
  normalizeHttpHistory,
  normalizeHttpWorkspace,
  requestDraftFromSaved,
  scopedHttpVariableMap,
} from './httpWorkspace'

type Kv = HttpKeyValue
type BodyType = HttpBodyType
type ReqTab = 'params' | 'auth' | 'headers' | 'cookies' | 'body' | 'variables' | 'tests'
type ResTab = 'body' | 'headers' | 'tests'

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
const WORKSPACE_KEY = 'http.workspace'
const HISTORY_KEY = 'http.history'
const AI_EXPORT_META_KEY = 'http.aiExportMetadata'
const HISTORY_LIMIT = 100
const RESPONSE_RENDER_LIMIT = 200_000
const assertionTypeOptions = Object.entries(HTTP_ASSERTION_LABELS) as Array<[HttpAssertionType, string]>
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
const auth = ref<HttpAuth>(defaultHttpAuth())
const cookies = ref<HttpCookie[]>([])
const multipart = ref<HttpMultipartPart[]>([])
const variables = ref<HttpKeyValue[]>([])
const assertions = ref<HttpAssertion[]>([])
const assertionResults = ref<HttpAssertionResult[]>([])
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

const history = ref<HttpHistoryEntry[]>([])
const workspace = ref<HttpWorkspaceState>(emptyHttpWorkspace())
const workspaceReady = ref(false)
const environmentDialogOpen = ref(false)
const rawUrlEditing = ref(false)
const tabRuntime = new Map<string, { response: HttpResponse | null, error: string, assertionResults: HttpAssertionResult[] }>()
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
const interchangeDialogOpen = ref(false)
const interchangeMode = ref<'import' | 'export'>('import')
const importFormat = ref<HttpImportFormat>('curl')
const exportFormat = ref<HttpExportFormat>('curl')
const interchangeContent = ref('')
const interchangeError = ref('')
const interchangeBusy = ref(false)

const filteredRequests = computed(() => filterHttpRequests(collections.value.requests, collectionSearch.value))
const activeRequest = computed(() => collections.value.requests.find(item => item.id === activeRequestId.value))
const activeEnvironment = computed(() => workspace.value.environments.find(item => item.id === workspace.value.activeEnvironmentId))
const resolvedUrlPrefix = computed(() => {
  const match = url.value.match(/^\{\{([^{}]+)\}\}/)
  if (!match)
    return null
  const name = match[1].trim()
  if (!name)
    return null
  const values = scopedHttpVariableMap(
    workspace.value.globalVariables,
    activeEnvironment.value,
    variables.value,
  )
  if (!Object.hasOwn(values, name) || !values[name].trim())
    return null
  return { name, token: match[0], value: values[name] }
})
const resolvedUrlPath = computed({
  get: () => resolvedUrlPrefix.value ? url.value.slice(resolvedUrlPrefix.value.token.length) : url.value,
  set: (value) => {
    if (resolvedUrlPrefix.value)
      url.value = `${resolvedUrlPrefix.value.token}${value}`
    else
      url.value = value
  },
})
const visibleGroups = computed(() => collections.value.groups.filter(group => (
  !collectionSearch.value.trim()
  || group.name.toLocaleLowerCase().includes(collectionSearch.value.trim().toLocaleLowerCase())
  || filteredRequests.value.some(request => request.groupId === group.id)
)))
const enabledAssertionCount = computed(() => assertions.value.filter(item => item.enabled).length)
const passedAssertionCount = computed(() => assertionResults.value.filter(item => item.passed).length)
const interchangeExportPreview = computed(() => {
  if (interchangeMode.value !== 'export')
    return ''
  return exportHttpProject(exportFormat.value, currentRequestDraft(), collections.value, workspace.value.globalVariables)
})

onMounted(async () => {
  try {
    collections.value = normalizeHttpCollection(await settings.getSetting<HttpCollectionState>(COLLECTIONS_KEY))
    expandedGroups.value = new Set(collections.value.groups.map(group => group.id))
  }
  catch (cause) {
    collectionStatus.value = `读取接口集合失败：${errorMessage(cause)}`
  }
  try {
    workspace.value = normalizeHttpWorkspace(await settings.getSetting<HttpWorkspaceState>(WORKSPACE_KEY))
    history.value = normalizeHttpHistory(await settings.getSetting<HttpHistoryEntry[]>(HISTORY_KEY))
    const activeTab = workspace.value.tabs.find(item => item.id === workspace.value.activeTabId) ?? workspace.value.tabs[0]
    applyRequestDraft(activeTab.request)
    activeRequestId.value = activeTab.activeRequestId
  }
  catch (cause) {
    collectionStatus.value = `读取 HTTP 工作区失败：${errorMessage(cause)}`
  }
  finally {
    workspaceReady.value = true
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

let workspacePersistTimer: ReturnType<typeof setTimeout> | undefined

watch([method, url, timeoutMs, query, headers, bodyType, body, auth, cookies, multipart, variables, assertions], () => {
  if (!workspaceReady.value)
    return
  syncActiveTab()
  if (workspacePersistTimer)
    clearTimeout(workspacePersistTimer)
  workspacePersistTimer = setTimeout(() => {
    void persistWorkspace()
  }, 250)
}, { deep: true })

onBeforeUnmount(() => {
  if (workspacePersistTimer)
    clearTimeout(workspacePersistTimer)
  if (workspaceReady.value) {
    syncActiveTab()
    void persistWorkspace()
  }
})

function emptyKv(): Kv {
  return { key: '', value: '', enabled: true }
}

function emptyCookie(): HttpCookie {
  return {
    id: crypto.randomUUID(),
    name: '',
    value: '',
    domain: '',
    path: '/',
    enabled: true,
  }
}

function emptyMultipartPart(kind: 'text' | 'file' = 'text'): HttpMultipartPart {
  return {
    id: crypto.randomUUID(),
    kind,
    name: '',
    value: '',
    filePath: '',
    fileName: '',
    contentType: '',
    enabled: true,
  }
}

function currentRequestDraft(): HttpRequestDraft {
  return cloneHttpRequestDraft({
    method: method.value,
    url: url.value,
    timeoutMs: timeoutMs.value,
    query: query.value,
    headers: headers.value,
    bodyType: bodyType.value,
    body: body.value,
    auth: auth.value,
    cookies: cookies.value,
    multipart: multipart.value,
    variables: variables.value,
    assertions: assertions.value,
  })
}

function applyRequestDraft(draft: HttpRequestDraft) {
  const value = cloneHttpRequestDraft(draft)
  method.value = value.method as typeof method.value
  url.value = value.url
  timeoutMs.value = value.timeoutMs
  query.value = value.query.length ? value.query : [emptyKv()]
  headers.value = value.headers.length ? value.headers : [emptyKv()]
  bodyType.value = value.bodyType
  body.value = value.body
  auth.value = value.auth
  cookies.value = value.cookies
  multipart.value = value.multipart
  variables.value = value.variables
  assertions.value = value.assertions
}

function syncActiveTab() {
  const tab = workspace.value.tabs.find(item => item.id === workspace.value.activeTabId)
  if (!tab)
    return
  tab.request = currentRequestDraft()
  tab.activeRequestId = activeRequestId.value
  tab.updatedAt = Date.now()
  if (activeRequest.value)
    tab.title = activeRequest.value.name
  else if (url.value.trim())
    tab.title = defaultRequestName()
}

async function persistWorkspace() {
  const snapshot = JSON.parse(JSON.stringify(workspace.value)) as HttpWorkspaceState
  await settings.setSetting(WORKSPACE_KEY, snapshot)
}

async function selectRequestTab(tabId: string) {
  if (tabId === workspace.value.activeTabId)
    return
  syncActiveTab()
  tabRuntime.set(workspace.value.activeTabId, {
    response: response.value,
    error: error.value,
    assertionResults: assertionResults.value,
  })
  const tab = workspace.value.tabs.find(item => item.id === tabId)
  if (!tab)
    return
  workspace.value.activeTabId = tabId
  applyRequestDraft(tab.request)
  activeRequestId.value = tab.activeRequestId
  const runtime = tabRuntime.get(tabId)
  response.value = runtime?.response ?? null
  error.value = runtime?.error ?? ''
  assertionResults.value = runtime?.assertionResults ?? []
  await persistWorkspace()
}

async function addRequestTab() {
  syncActiveTab()
  const tab = createHttpRequestTab()
  workspace.value.tabs.push(tab)
  workspace.value.activeTabId = tab.id
  activeRequestId.value = ''
  applyRequestDraft(tab.request)
  response.value = null
  error.value = ''
  assertionResults.value = []
  await persistWorkspace()
}

async function closeRequestTab(tabId: string) {
  syncActiveTab()
  const index = workspace.value.tabs.findIndex(item => item.id === tabId)
  if (index < 0)
    return
  tabRuntime.delete(tabId)
  workspace.value.tabs.splice(index, 1)
  if (!workspace.value.tabs.length)
    workspace.value.tabs.push(createHttpRequestTab())
  if (workspace.value.activeTabId === tabId) {
    const next = workspace.value.tabs[Math.min(index, workspace.value.tabs.length - 1)]
    workspace.value.activeTabId = next.id
    activeRequestId.value = next.activeRequestId
    applyRequestDraft(next.request)
    const runtime = tabRuntime.get(next.id)
    response.value = runtime?.response ?? null
    error.value = runtime?.error ?? ''
    assertionResults.value = runtime?.assertionResults ?? []
  }
  await persistWorkspace()
}

async function selectEnvironment() {
  await persistWorkspace()
}

function openVariableManager() {
  environmentDialogOpen.value = true
}

function addEnvironment() {
  const environment = {
    id: crypto.randomUUID(),
    name: `环境 ${workspace.value.environments.length + 1}`,
    variables: [{ key: '', value: '', enabled: true }],
  }
  workspace.value.environments.push(environment)
  workspace.value.activeEnvironmentId = environment.id
}

function removeEnvironment(environmentId: string) {
  if (workspace.value.environments.length <= 1)
    return
  workspace.value.environments = workspace.value.environments.filter(item => item.id !== environmentId)
  if (workspace.value.activeEnvironmentId === environmentId)
    workspace.value.activeEnvironmentId = workspace.value.environments[0].id
}

function addEnvironmentVariable(environmentId: string) {
  workspace.value.environments.find(item => item.id === environmentId)?.variables.push(emptyKv())
}

function removeEnvironmentVariable(environmentId: string, index: number) {
  const environment = workspace.value.environments.find(item => item.id === environmentId)
  if (!environment)
    return
  environment.variables.splice(index, 1)
  if (!environment.variables.length)
    environment.variables.push(emptyKv())
}

function addGlobalVariable() {
  workspace.value.globalVariables.push(emptyKv())
}

function removeGlobalVariable(index: number) {
  workspace.value.globalVariables.splice(index, 1)
  if (!workspace.value.globalVariables.length)
    workspace.value.globalVariables.push(emptyKv())
}

async function closeEnvironmentDialog() {
  environmentDialogOpen.value = false
  await persistWorkspace()
}

function addCookieRow() {
  cookies.value.push(emptyCookie())
}

function removeCookieRow(index: number) {
  cookies.value.splice(index, 1)
}

function addMultipartRow(kind: 'text' | 'file') {
  multipart.value.push(emptyMultipartPart(kind))
}

function removeMultipartRow(index: number) {
  multipart.value.splice(index, 1)
}

function addRequestVariable() {
  variables.value.push(emptyKv())
}

function removeRequestVariable(index: number) {
  variables.value.splice(index, 1)
}

function addAssertion() {
  assertions.value.push(emptyHttpAssertion())
}

function removeAssertion(index: number) {
  assertions.value.splice(index, 1)
  assertionResults.value = []
}

function assertionNeedsTarget(type: HttpAssertionType) {
  return ['header-exists', 'header-equals', 'header-contains', 'json-path-exists', 'json-path-equals'].includes(type)
}

function assertionNeedsExpected(type: HttpAssertionType) {
  return !['header-exists', 'json-path-exists'].includes(type)
}

function onAssertionTypeChange(assertion: HttpAssertion) {
  assertion.target = ''
  assertion.expected = assertion.type === 'status-equals'
    ? '200'
    : assertion.type === 'duration-less-than' ? '500' : ''
  assertionResults.value = []
}

async function chooseMultipartFile(index: number) {
  const path = await openFile({ multiple: false, directory: false })
  if (typeof path !== 'string')
    return
  const part = multipart.value[index]
  if (!part)
    return
  part.filePath = path
  part.fileName = path.split(/[\\/]/).at(-1) ?? ''
}

async function clearCookieJar() {
  workspace.value.cookieJar = []
  await persistWorkspace()
}

function openInterchangeDialog(mode: 'import' | 'export') {
  interchangeMode.value = mode
  interchangeError.value = ''
  interchangeContent.value = ''
  if (mode === 'import')
    importFormat.value = 'curl'
  else
    exportFormat.value = 'curl'
  interchangeDialogOpen.value = true
}

function closeInterchangeDialog() {
  if (interchangeBusy.value)
    return
  interchangeDialogOpen.value = false
  interchangeError.value = ''
}

function detectImportFormat(path: string, content: string): HttpImportFormat {
  const lowerPath = path.toLocaleLowerCase()
  const trimmed = content.trim()
  if (trimmed.toLocaleLowerCase().startsWith('curl '))
    return 'curl'
  if (lowerPath.endsWith('.yaml') || lowerPath.endsWith('.yml'))
    return 'openapi'
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    if (parsed.openapi || parsed.swagger)
      return 'openapi'
    if (parsed.info && Array.isArray(parsed.item))
      return 'postman'
  }
  catch {
    // YAML OpenAPI is handled by the parser after format selection.
  }
  return importFormat.value
}

async function chooseInterchangeFile() {
  const path = await openFile({
    multiple: false,
    directory: false,
    filters: [{ name: 'API 文件', extensions: ['json', 'yaml', 'yml', 'txt', 'curl'] }],
  })
  if (typeof path !== 'string')
    return
  try {
    const content = await readTextFile(path)
    interchangeContent.value = content
    importFormat.value = detectImportFormat(path, content)
    interchangeError.value = ''
  }
  catch (cause) {
    interchangeError.value = `读取文件失败：${errorMessage(cause)}`
  }
}

async function runInterchangeImport() {
  if (!interchangeContent.value.trim()) {
    interchangeError.value = '请粘贴内容或选择文件'
    return
  }
  interchangeBusy.value = true
  interchangeError.value = ''
  try {
    const project = importHttpProject(interchangeContent.value, importFormat.value)
    const result = mergeImportedHttpProject(collections.value, workspace.value.globalVariables, project)
    collections.value = result.collection
    workspace.value.globalVariables = result.globalVariables
    expandedGroups.value = new Set(collections.value.groups.map(group => group.id))
    await persistCollections(`已导入 ${result.groupCount} 个分组、${result.requestCount} 个接口`)
    await persistWorkspace()
    interchangeBusy.value = false
    closeInterchangeDialog()
  }
  catch (cause) {
    interchangeError.value = `导入失败：${errorMessage(cause)}`
  }
  finally {
    interchangeBusy.value = false
  }
}

function interchangeFilename(format: HttpExportFormat) {
  if (format === 'curl')
    return 'toolbox-request.curl.txt'
  if (format === 'postman')
    return 'toolbox.postman_collection.json'
  if (format === 'openapi-yaml')
    return 'toolbox.openapi.yaml'
  return 'toolbox.openapi.json'
}

async function copyInterchangeExport() {
  await navigator.clipboard.writeText(interchangeExportPreview.value)
  collectionStatus.value = '导出内容已复制'
}

async function saveInterchangeExport() {
  if (exportFormat.value !== 'curl' && !collections.value.requests.length) {
    interchangeError.value = '接口集合为空，请先保存或导入接口'
    return
  }
  interchangeBusy.value = true
  interchangeError.value = ''
  try {
    const path = await saveFile({
      defaultPath: interchangeFilename(exportFormat.value),
      filters: [{
        name: 'API 文件',
        extensions: exportFormat.value === 'openapi-yaml' ? ['yaml'] : exportFormat.value === 'curl' ? ['txt'] : ['json'],
      }],
    })
    if (!path)
      return
    await writeTextFile(path, interchangeExportPreview.value)
    interchangeBusy.value = false
    closeInterchangeDialog()
    collectionStatus.value = `已导出：${path}`
  }
  catch (cause) {
    interchangeError.value = `导出失败：${errorMessage(cause)}`
  }
  finally {
    interchangeBusy.value = false
  }
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

function utf8Base64(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes)
    binary += String.fromCharCode(byte)
  return btoa(binary)
}

function resolveRequestForSend() {
  const variableValues = scopedHttpVariableMap(
    workspace.value.globalVariables,
    activeEnvironment.value,
    variables.value,
  )
  const missing = new Set<string>()
  const interpolate = (value: string) => {
    const result = interpolateHttpValue(value, variableValues)
    result.missing.forEach(name => missing.add(name))
    return result.value
  }
  const resolvedUrl = interpolate(url.value.trim())
  const resolvedQuery = cloneHttpKeyValues(query.value).map(row => ({
    ...row,
    key: interpolate(row.key),
    value: interpolate(row.value),
  }))
  const resolvedHeaders = cloneHttpKeyValues(headers.value).map(row => ({
    ...row,
    key: interpolate(row.key),
    value: interpolate(row.value),
  }))
  const resolvedBody = interpolate(body.value)
  const resolvedMultipart = cloneHttpMultipart(multipart.value).map(part => ({
    ...part,
    name: interpolate(part.name),
    value: interpolate(part.value),
    filePath: interpolate(part.filePath),
    fileName: interpolate(part.fileName),
    contentType: interpolate(part.contentType),
  }))
  const resolvedAuth = cloneHttpAuth(auth.value)
  resolvedAuth.token = interpolate(resolvedAuth.token)
  resolvedAuth.username = interpolate(resolvedAuth.username)
  resolvedAuth.password = interpolate(resolvedAuth.password)
  resolvedAuth.key = interpolate(resolvedAuth.key)
  resolvedAuth.value = interpolate(resolvedAuth.value)

  const upsert = (rows: Kv[], key: string, value: string) => {
    const existing = rows.find(row => row.key.trim().toLocaleLowerCase() === key.toLocaleLowerCase())
    if (existing) {
      existing.value = value
      existing.enabled = true
    }
    else {
      rows.push({ key, value, enabled: true })
    }
  }

  if (resolvedAuth.type === 'bearer' && resolvedAuth.token) {
    upsert(resolvedHeaders, 'Authorization', `Bearer ${resolvedAuth.token}`)
  }
  else if (resolvedAuth.type === 'basic') {
    upsert(resolvedHeaders, 'Authorization', `Basic ${utf8Base64(`${resolvedAuth.username}:${resolvedAuth.password}`)}`)
  }
  else if (resolvedAuth.type === 'api-key' && resolvedAuth.key) {
    if (resolvedAuth.addTo === 'query') {
      upsert(resolvedQuery, resolvedAuth.key, resolvedAuth.value)
    }
    else {
      upsert(resolvedHeaders, resolvedAuth.key, resolvedAuth.value)
    }
  }

  const resolvedRequestCookies = cloneHttpCookies(cookies.value).map(cookie => ({
    ...cookie,
    name: interpolate(cookie.name),
    value: interpolate(cookie.value),
    domain: interpolate(cookie.domain),
    path: interpolate(cookie.path),
  }))
  const cookieMap = new Map<string, HttpCookie>()
  for (const cookie of cookiesForUrl(workspace.value.cookieJar, resolvedUrl))
    cookieMap.set(cookie.name, cookie)
  for (const cookie of cookiesForUrl(resolvedRequestCookies, resolvedUrl))
    cookieMap.set(cookie.name, cookie)
  if (cookieMap.size) {
    const cookieHeader = [...cookieMap.values()].map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
    upsert(resolvedHeaders, 'Cookie', cookieHeader)
  }

  if (missing.size)
    throw new Error(`当前环境缺少变量：${[...missing].join('、')}`)

  return {
    method: method.value,
    url: resolvedUrl,
    headers: resolvedHeaders,
    query: resolvedQuery,
    body: resolvedBody,
    bodyType: bodyType.value,
    multipart: resolvedMultipart,
    timeoutMs: timeoutMs.value,
  }
}

async function send() {
  error.value = ''
  exportStatus.value = ''
  response.value = null
  assertionResults.value = []
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

    const request = resolveRequestForSend()
    const res = await invoke<HttpResponse>('http_request', { input: request })
    response.value = res
    assertionResults.value = evaluateHttpAssertions(assertions.value, res)
    if (res.error)
      error.value = res.error
    workspace.value.cookieJar = captureResponseCookies(res.headers, res.finalUrl, workspace.value.cookieJar)
    history.value.unshift({
      id: crypto.randomUUID(),
      status: res.status,
      statusText: res.statusText,
      durationMs: res.durationMs,
      at: Date.now(),
      request: currentRequestDraft(),
    })
    if (history.value.length > HISTORY_LIMIT)
      history.value.length = HISTORY_LIMIT
    await settings.setSetting(HISTORY_KEY, JSON.parse(JSON.stringify(history.value)))
    syncActiveTab()
    await persistWorkspace()
    resTab.value = enabledAssertionCount.value ? 'tests' : 'body'
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

function loadHistory(item: HttpHistoryEntry) {
  activeRequestId.value = ''
  applyRequestDraft(item.request)
  response.value = null
  assertionResults.value = []
  error.value = ''
  syncActiveTab()
}

async function clearHistory() {
  history.value = []
  await settings.setSetting(HISTORY_KEY, [])
}

function onBodyTypeChange() {
  if (bodyType.value === 'json' && !body.value.trim()) {
    body.value = '{\n  \n}'
  }
  if (bodyType.value === 'multipart' && !multipart.value.length)
    multipart.value = [emptyMultipartPart()]
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
  const draft = emptyHttpRequestDraft()
  draft.url = ''
  applyRequestDraft(draft)
  response.value = null
  assertionResults.value = []
  error.value = ''
  collectionStatus.value = '已清空请求编辑区'
}

async function loadSavedRequest(saved: SavedHttpRequest) {
  syncActiveTab()
  const openTab = workspace.value.tabs.find(item => item.activeRequestId === saved.id)
  if (openTab) {
    await selectRequestTab(openTab.id)
    collectionStatus.value = `已切换到“${saved.name}”`
    return
  }

  let tab = workspace.value.tabs.find(item => item.id === workspace.value.activeTabId)
  const blankDraft = emptyHttpRequestDraft()
  const canReuseActiveTab = tab
    && !tab.activeRequestId
    && (tab.request.url === '' || JSON.stringify(tab.request) === JSON.stringify(blankDraft))
  if (!canReuseActiveTab) {
    tab = createHttpRequestTab(saved.name)
    workspace.value.tabs.push(tab)
    workspace.value.activeTabId = tab.id
  }

  const draft = requestDraftFromSaved(saved)
  activeRequestId.value = saved.id
  applyRequestDraft(draft)
  response.value = null
  assertionResults.value = []
  error.value = ''
  if (tab) {
    tab.title = saved.name
    tab.activeRequestId = saved.id
    tab.request = cloneHttpRequestDraft(draft)
  }
  syncActiveTab()
  await persistWorkspace()
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
    auth: cloneHttpAuth(auth.value),
    cookies: cloneHttpCookies(cookies.value),
    multipart: cloneHttpMultipart(multipart.value),
    variables: cloneHttpKeyValues(variables.value),
    assertions: assertions.value.map(assertion => ({ ...assertion })),
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
    syncActiveTab()
    await persistWorkspace()
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
    <div data-testid="http-workspace" class="grid h-full min-h-0 gap-3 md:grid-cols-[240px_minmax(0,1fr)] md:grid-rows-[auto_auto_minmax(0,1fr)_auto]">
      <div class="flex min-h-9 max-w-full items-end gap-1 overflow-x-auto border-b border-border md:col-start-2 md:row-start-1">
        <button
          v-for="tab in workspace.tabs"
          :key="tab.id"
          type="button"
          data-testid="http-request-tab"
          class="group/tab flex h-9 min-w-[150px] max-w-[240px] items-center gap-2 border-x border-t px-3 text-left text-xs"
          :class="workspace.activeTabId === tab.id ? 'border-border bg-card font-medium' : 'border-transparent text-muted-foreground hover:bg-muted/50'"
          @click="selectRequestTab(tab.id)"
        >
          <span class="font-mono text-[10px] font-bold" :class="methodClass(tab.request.method)">{{ tab.request.method }}</span>
          <span class="min-w-0 flex-1 truncate">{{ tab.title }}</span>
          <span class="grid size-5 shrink-0 place-items-center rounded opacity-0 hover:bg-muted group-hover/tab:opacity-100" title="关闭标签" @click.stop="closeRequestTab(tab.id)">
            <X class="size-3" />
          </span>
        </button>
        <Button type="button" size="sm" variant="ghost" class="mb-0.5 size-8 shrink-0 p-0" title="新建请求标签" @click="addRequestTab">
          <Plus class="size-4" />
        </Button>
      </div>

      <!-- URL bar -->
      <div class="flex min-w-0 flex-wrap gap-2 md:col-start-2 md:row-start-2">
        <select
          v-model="method"
          class="h-9 w-[110px] rounded-md border border-input bg-background px-2 font-mono text-sm font-semibold"
        >
          <option v-for="m in methods" :key="m" :value="m">
            {{ m }}
          </option>
        </select>
        <div class="relative flex h-9 min-w-[220px] flex-1 overflow-hidden rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
          <span
            v-if="resolvedUrlPrefix && !rawUrlEditing"
            data-testid="http-url-base-prefix"
            class="flex h-full max-w-[55%] shrink-0 items-center truncate border-r border-input bg-muted/60 px-3 font-mono text-xs text-foreground"
            :title="`${resolvedUrlPrefix.name} · ${resolvedUrlPrefix.value}`"
          >
            {{ resolvedUrlPrefix.value }}
          </span>
          <input
            v-if="resolvedUrlPrefix && !rawUrlEditing"
            v-model="resolvedUrlPath"
            data-testid="http-url-input"
            class="h-full min-w-0 flex-1 border-0 bg-transparent px-3 pr-10 font-mono text-sm outline-none"
            placeholder="/v1/..."
            @keydown.enter.prevent="send"
          >
          <input
            v-else
            v-model="url"
            data-testid="http-url-input"
            class="h-full min-w-0 flex-1 border-0 bg-transparent px-3 pr-10 font-mono text-sm outline-none"
            placeholder="https://api.example.com/v1/..."
            @focus="rawUrlEditing = true"
            @blur="rawUrlEditing = false"
            @keydown.enter.prevent="send"
          >
          <button
            type="button"
            class="absolute right-1 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            :class="resolvedUrlPrefix ? 'bg-muted text-foreground' : ''"
            title="编辑变量"
            @click="openVariableManager"
          >
            <Braces class="size-4" />
          </button>
        </div>
        <input
          v-model.number="timeoutMs"
          type="number"
          min="1000"
          step="1000"
          title="超时 (ms)"
          class="h-9 w-[110px] rounded-md border border-input bg-background px-2 font-mono text-sm"
        >
        <select
          v-model="workspace.activeEnvironmentId"
          class="h-9 min-w-[126px] rounded-md border border-input bg-background px-2 text-sm"
          title="当前请求环境"
          @change="selectEnvironment"
        >
          <option v-for="environment in workspace.environments" :key="environment.id" :value="environment.id">
            {{ environment.name }}
          </option>
        </select>
        <Button type="button" size="sm" variant="ghost" class="size-8 p-0" title="管理环境变量" @click="environmentDialogOpen = true">
          <Settings2 class="size-4" />
        </Button>
        <Button size="sm" variant="outline" class="gap-2" title="导入 cURL、Postman Collection 或 OpenAPI" @click="openInterchangeDialog('import')">
          <FileUp class="size-4" />
          导入
        </Button>
        <Button size="sm" variant="outline" class="gap-2" title="导出当前请求或接口集合" @click="openInterchangeDialog('export')">
          <Download class="size-4" />
          导出
        </Button>
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

      <div class="contents">
        <aside data-testid="http-collection-sidebar" class="flex max-h-72 min-h-0 flex-col overflow-hidden rounded-md border border-border bg-background md:col-start-1 md:row-start-1 md:row-span-4 md:max-h-none">
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

        <div class="grid min-h-0 min-w-0 gap-3 md:col-start-2 md:row-start-3 lg:grid-cols-2">
          <!-- Request -->
          <div class="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
            <div class="flex items-center gap-1 overflow-x-auto border-b border-border px-2 pt-2">
              <button
                v-for="t in ([
                  ['params', 'Params'],
                  ['auth', 'Auth'],
                  ['headers', 'Headers'],
                  ['cookies', 'Cookies'],
                  ['body', 'Body'],
                  ['variables', '变量'],
                  ['tests', '断言'],
                ] as const)"
                :key="t[0]"
                type="button"
                class="shrink-0 whitespace-nowrap rounded-t-md px-2 py-2 text-xs"
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

              <div v-else-if="reqTab === 'auth'" class="space-y-4">
                <label class="grid gap-1.5 text-xs font-medium">
                  鉴权方式
                  <select v-model="auth.type" class="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal">
                    <option value="none">
                      无鉴权
                    </option>
                    <option value="bearer">
                      Bearer Token
                    </option>
                    <option value="basic">
                      Basic Auth
                    </option>
                    <option value="api-key">
                      API Key
                    </option>
                  </select>
                </label>
                <label v-if="auth.type === 'bearer'" class="grid gap-1.5 text-xs font-medium">
                  Token
                  <input v-model="auth.token" type="password" autocomplete="off" class="h-9 rounded-md border border-input bg-background px-3 font-mono text-sm font-normal" placeholder="可使用 {{token}}">
                </label>
                <template v-else-if="auth.type === 'basic'">
                  <label class="grid gap-1.5 text-xs font-medium">
                    用户名
                    <input v-model="auth.username" autocomplete="off" class="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal" placeholder="可使用 {{username}}">
                  </label>
                  <label class="grid gap-1.5 text-xs font-medium">
                    密码
                    <input v-model="auth.password" type="password" autocomplete="new-password" class="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal" placeholder="可使用 {{password}}">
                  </label>
                </template>
                <template v-else-if="auth.type === 'api-key'">
                  <div class="grid gap-3 sm:grid-cols-[1fr_1fr_120px]">
                    <label class="grid gap-1.5 text-xs font-medium">
                      Key
                      <input v-model="auth.key" class="h-9 rounded-md border border-input bg-background px-3 font-mono text-sm font-normal">
                    </label>
                    <label class="grid gap-1.5 text-xs font-medium">
                      Value
                      <input v-model="auth.value" type="password" autocomplete="off" class="h-9 rounded-md border border-input bg-background px-3 font-mono text-sm font-normal">
                    </label>
                    <label class="grid gap-1.5 text-xs font-medium">
                      添加到
                      <select v-model="auth.addTo" class="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal">
                        <option value="header">
                          Header
                        </option>
                        <option value="query">
                          Query
                        </option>
                      </select>
                    </label>
                  </div>
                </template>
                <p class="text-xs text-muted-foreground">
                  鉴权配置保存在本机工作区和已保存接口中，不会同步到云端。
                </p>
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

              <div v-else-if="reqTab === 'cookies'" class="space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <p class="text-xs text-muted-foreground">
                    请求 Cookie 会覆盖同名自动 Cookie；响应中的 Set-Cookie 会保存在本地 Cookie Jar。
                  </p>
                  <Button type="button" size="sm" variant="outline" @click="addCookieRow">
                    + Cookie
                  </Button>
                </div>
                <div
                  v-for="(cookie, idx) in cookies"
                  :key="cookie.id"
                  class="grid grid-cols-[24px_1fr_1fr_1fr_80px_32px] items-center gap-2"
                >
                  <input v-model="cookie.enabled" type="checkbox" class="size-4">
                  <input v-model="cookie.name" placeholder="Name" class="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs">
                  <input v-model="cookie.value" placeholder="Value" class="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs">
                  <input v-model="cookie.domain" placeholder="Domain（可留空）" class="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs">
                  <input v-model="cookie.path" placeholder="/" class="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs">
                  <Button type="button" size="sm" variant="ghost" class="h-8 px-2" @click="removeCookieRow(idx)">
                    ×
                  </Button>
                </div>
                <p v-if="!cookies.length" class="text-sm text-muted-foreground">
                  当前请求没有专属 Cookie。
                </p>
                <div class="flex items-center justify-between border-t border-border pt-3">
                  <span class="text-xs text-muted-foreground">Cookie Jar：{{ workspace.cookieJar.length }} 条</span>
                  <Button type="button" size="sm" variant="ghost" :disabled="!workspace.cookieJar.length" @click="clearCookieJar">
                    清空 Cookie Jar
                  </Button>
                </div>
              </div>

              <div v-else-if="reqTab === 'body'" class="space-y-2">
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
                    <option value="multipart">
                      multipart/form-data
                    </option>
                  </select>
                  <Button
                    v-if="bodyType === 'json'"
                    size="sm"
                    variant="outline"
                    @click="prettyBody"
                  >
                    格式化 JSON
                  </Button>
                </div>
                <textarea
                  v-if="bodyType !== 'none' && bodyType !== 'multipart'"
                  v-model="body"
                  class="min-h-[260px] w-full resize-y rounded-md border border-input bg-background p-3 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  :placeholder="bodyPlaceholder"
                />
                <div v-else-if="bodyType === 'multipart'" class="space-y-2">
                  <div
                    v-for="(part, idx) in multipart"
                    :key="part.id"
                    class="grid grid-cols-[24px_88px_minmax(100px,0.8fr)_minmax(160px,1.4fr)_32px] items-center gap-2"
                  >
                    <input v-model="part.enabled" type="checkbox" class="size-4">
                    <select v-model="part.kind" class="h-8 rounded-md border border-input bg-background px-2 text-xs">
                      <option value="text">
                        文本
                      </option>
                      <option value="file">
                        文件
                      </option>
                    </select>
                    <input v-model="part.name" placeholder="字段名" class="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs">
                    <input v-if="part.kind === 'text'" v-model="part.value" placeholder="值，可使用 {{variable}}" class="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs">
                    <div v-else class="flex min-w-0 gap-2">
                      <input v-model="part.filePath" readonly placeholder="选择文件" class="h-8 min-w-0 flex-1 rounded-md border border-input bg-muted/30 px-2 font-mono text-xs">
                      <Button type="button" size="sm" variant="outline" class="h-8 gap-1.5" @click="chooseMultipartFile(idx)">
                        <FileUp class="size-3.5" />
                        选择
                      </Button>
                    </div>
                    <Button type="button" size="sm" variant="ghost" class="h-8 px-2" @click="removeMultipartRow(idx)">
                      ×
                    </Button>
                  </div>
                  <div class="flex gap-2">
                    <Button type="button" size="sm" variant="outline" @click="addMultipartRow('text')">
                      + 文本字段
                    </Button>
                    <Button type="button" size="sm" variant="outline" @click="addMultipartRow('file')">
                      + 文件字段
                    </Button>
                  </div>
                </div>
                <p v-else class="text-sm text-muted-foreground">
                  当前无 Body（GET/HEAD 会忽略 Body）
                </p>
              </div>

              <div v-else-if="reqTab === 'variables'" class="space-y-3">
                <p class="text-xs text-muted-foreground">
                  请求变量优先级最高，会覆盖当前环境和全局范围中的同名变量。
                </p>
                <div
                  v-for="(variable, idx) in variables"
                  :key="idx"
                  class="grid grid-cols-[24px_1fr_1fr_32px] items-center gap-2"
                >
                  <input v-model="variable.enabled" type="checkbox" class="size-4">
                  <input v-model="variable.key" placeholder="变量名" class="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs">
                  <input v-model="variable.value" placeholder="变量值" class="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs">
                  <Button type="button" size="sm" variant="ghost" class="h-8 px-2" @click="removeRequestVariable(idx)">
                    ×
                  </Button>
                </div>
                <p v-if="!variables.length" class="text-sm text-muted-foreground">
                  当前请求没有专属变量。
                </p>
                <Button type="button" size="sm" variant="outline" @click="addRequestVariable">
                  + 请求变量
                </Button>
              </div>

              <div v-else class="space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <p class="text-xs text-muted-foreground">
                    请求完成后自动运行已启用的断言。
                  </p>
                  <Button type="button" size="sm" variant="outline" @click="addAssertion">
                    + 断言
                  </Button>
                </div>
                <div
                  v-for="(assertion, idx) in assertions"
                  :key="assertion.id"
                  class="grid grid-cols-[24px_minmax(140px,0.8fr)_minmax(120px,1fr)_minmax(120px,1fr)_32px] items-center gap-2"
                >
                  <input v-model="assertion.enabled" type="checkbox" class="size-4">
                  <select v-model="assertion.type" class="h-8 rounded-md border border-input bg-background px-2 text-xs" @change="onAssertionTypeChange(assertion)">
                    <option v-for="[value, label] in assertionTypeOptions" :key="value" :value="value">
                      {{ label }}
                    </option>
                  </select>
                  <input
                    v-if="assertionNeedsTarget(assertion.type)"
                    v-model="assertion.target"
                    :placeholder="assertion.type.startsWith('header') ? 'Header 名' : 'JSON Path，例如 $.data.id'"
                    class="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs"
                  >
                  <span v-else class="px-2 text-xs text-muted-foreground">—</span>
                  <input
                    v-if="assertionNeedsExpected(assertion.type)"
                    v-model="assertion.expected"
                    :placeholder="assertion.type === 'duration-less-than' ? '毫秒' : '期望值'"
                    class="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs"
                  >
                  <span v-else class="px-2 text-xs text-muted-foreground">—</span>
                  <Button type="button" size="sm" variant="ghost" class="h-8 px-2" @click="removeAssertion(idx)">
                    ×
                  </Button>
                </div>
                <p v-if="!assertions.length" class="text-sm text-muted-foreground">
                  尚未配置响应断言。
                </p>
              </div>
            </div>
          </div>

          <!-- Response -->
          <div class="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
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
              <div class="flex min-w-0 flex-wrap justify-end gap-1">
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
                <button
                  type="button"
                  class="rounded-md px-2 py-1 text-sm"
                  :class="resTab === 'tests' ? 'bg-muted font-medium' : 'text-muted-foreground'"
                  @click="resTab = 'tests'"
                >
                  Tests
                  <span v-if="assertionResults.length" class="ml-1 text-xs">
                    {{ passedAssertionCount }}/{{ assertionResults.length }}
                  </span>
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

              <div v-else-if="resTab === 'headers'" class="space-y-1">
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
              <div v-else class="space-y-2" data-testid="http-assertion-results">
                <div
                  v-for="result in assertionResults"
                  :key="result.id"
                  class="rounded-md border px-3 py-2 text-sm"
                  :class="result.passed
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'border-destructive/30 bg-destructive/5 text-destructive'"
                >
                  <div class="font-medium">
                    {{ result.passed ? '通过' : '失败' }} · {{ result.label }}
                  </div>
                  <div class="mt-1 break-all font-mono text-xs opacity-80">
                    {{ result.message }}
                  </div>
                </div>
                <p v-if="!assertionResults.length" class="text-sm text-muted-foreground">
                  {{ enabledAssertionCount ? '发送请求后查看断言结果。' : '请先在请求的“断言”页签中添加测试。' }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- History -->
      <div v-if="history.length" data-testid="recent-requests" class="flex h-[230px] shrink-0 flex-col rounded-xl border border-border p-3 md:col-start-2 md:row-start-4">
        <div class="mb-2 flex shrink-0 items-center justify-between gap-3">
          <span class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <History class="size-3.5" />
            请求历史 · {{ history.length }}
          </span>
          <Button type="button" size="sm" variant="ghost" class="h-7 px-2 text-xs" @click="clearHistory">
            清空历史
          </Button>
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
              <span class="font-semibold">{{ h.request.method }}</span>
              <span class="mx-1 text-muted-foreground">{{ h.status || 'ERR' }}</span>
              <span class="max-w-[220px] truncate align-bottom">{{ h.request.url }}</span>
            </button>
          </div>
        </div>
      </div>

      <div v-if="environmentDialogOpen" data-testid="environment-dialog-overlay" class="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
        <section class="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-md border border-border bg-background shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="environment-dialog-title">
          <div class="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 id="environment-dialog-title" class="flex items-center gap-2 text-sm font-semibold">
                <Braces class="size-4" />
                变量管理
              </h2>
              <p class="mt-0.5 text-xs text-muted-foreground">
                在 URL、Params、Headers、Auth、Cookies 和 Body 中使用 <code v-pre>{{ variable }}</code>；优先级：请求 &gt; 环境 &gt; 全局。
              </p>
            </div>
            <Button type="button" size="sm" variant="ghost" class="size-8 p-0" title="关闭" @click="closeEnvironmentDialog">
              <X class="size-4" />
            </Button>
          </div>
          <div class="min-h-0 flex-1 overflow-auto p-4">
            <div class="mb-4 border-b border-border pb-4">
              <div class="mb-2 text-sm font-semibold">
                全局变量
              </div>
              <div class="space-y-2">
                <div v-for="(variable, idx) in workspace.globalVariables" :key="idx" class="grid grid-cols-[24px_1fr_1fr_32px] items-center gap-2">
                  <input v-model="variable.enabled" type="checkbox" class="size-4">
                  <input v-model="variable.key" placeholder="变量名，例如 tenantId" class="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs">
                  <input v-model="variable.value" placeholder="变量值" class="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs">
                  <Button type="button" size="sm" variant="ghost" class="h-8 px-2" @click="removeGlobalVariable(idx)">
                    ×
                  </Button>
                </div>
              </div>
              <Button type="button" size="sm" variant="outline" class="mt-2" @click="addGlobalVariable">
                + 全局变量
              </Button>
            </div>
            <div class="mb-2 text-sm font-semibold">
              环境变量
            </div>
            <div v-for="environment in workspace.environments" :key="environment.id" class="mb-4 border-b border-border pb-4 last:mb-0 last:border-0 last:pb-0">
              <div class="mb-2 flex items-center gap-2">
                <input v-model="environment.name" class="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm font-medium" aria-label="环境名称">
                <Button type="button" size="sm" variant="ghost" class="size-8 p-0 text-muted-foreground" title="删除环境" :disabled="workspace.environments.length <= 1" @click="removeEnvironment(environment.id)">
                  <Trash2 class="size-4" />
                </Button>
              </div>
              <div class="space-y-2">
                <div v-for="(variable, idx) in environment.variables" :key="idx" class="grid grid-cols-[24px_1fr_1fr_32px] items-center gap-2">
                  <input v-model="variable.enabled" type="checkbox" class="size-4">
                  <input v-model="variable.key" placeholder="变量名，例如 baseUrl" class="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs">
                  <input v-model="variable.value" placeholder="变量值" class="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs">
                  <Button type="button" size="sm" variant="ghost" class="h-8 px-2" @click="removeEnvironmentVariable(environment.id, idx)">
                    ×
                  </Button>
                </div>
              </div>
              <Button type="button" size="sm" variant="outline" class="mt-2" @click="addEnvironmentVariable(environment.id)">
                + 变量
              </Button>
            </div>
            <Button type="button" size="sm" variant="outline" class="gap-2" @click="addEnvironment">
              <Plus class="size-4" />
              新建环境
            </Button>
          </div>
          <div class="flex justify-end border-t border-border px-4 py-3">
            <Button type="button" size="sm" @click="closeEnvironmentDialog">
              完成
            </Button>
          </div>
        </section>
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

      <div v-if="interchangeDialogOpen" data-testid="interchange-dialog-overlay" class="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
        <section class="flex max-h-[82vh] w-full max-w-3xl flex-col rounded-md border border-border bg-background shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="interchange-title">
          <div class="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 id="interchange-title" class="text-sm font-semibold">
                {{ interchangeMode === 'import' ? '导入 API 项目' : '导出 API 项目' }}
              </h2>
              <p class="mt-0.5 text-xs text-muted-foreground">
                {{ interchangeMode === 'import' ? '导入内容会追加到本地接口集合，不覆盖已有接口。' : 'cURL 导出当前请求，Postman / OpenAPI 导出全部已保存接口。' }}
              </p>
            </div>
            <Button type="button" size="sm" variant="ghost" class="size-8 p-0" title="关闭" :disabled="interchangeBusy" @click="closeInterchangeDialog">
              <X class="size-4" />
            </Button>
          </div>
          <div class="grid min-h-0 flex-1 gap-3 overflow-auto p-4">
            <div class="flex flex-wrap items-end gap-2">
              <label v-if="interchangeMode === 'import'" class="grid min-w-[220px] gap-1.5 text-xs font-medium">
                导入格式
                <select v-model="importFormat" class="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal">
                  <option value="curl">
                    cURL
                  </option>
                  <option value="postman">
                    Postman Collection 2.1
                  </option>
                  <option value="openapi">
                    OpenAPI JSON / YAML
                  </option>
                </select>
              </label>
              <label v-else class="grid min-w-[220px] gap-1.5 text-xs font-medium">
                导出格式
                <select v-model="exportFormat" class="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal">
                  <option value="curl">
                    cURL（当前请求）
                  </option>
                  <option value="postman">
                    Postman Collection 2.1
                  </option>
                  <option value="openapi-json">
                    OpenAPI JSON
                  </option>
                  <option value="openapi-yaml">
                    OpenAPI YAML
                  </option>
                </select>
              </label>
              <Button v-if="interchangeMode === 'import'" type="button" size="sm" variant="outline" class="gap-2" @click="chooseInterchangeFile">
                <FileUp class="size-4" />
                选择文件
              </Button>
              <Button v-else type="button" size="sm" variant="outline" class="gap-2" @click="copyInterchangeExport">
                <Copy class="size-4" />
                复制
              </Button>
            </div>
            <textarea
              v-if="interchangeMode === 'import'"
              v-model="interchangeContent"
              data-testid="interchange-input"
              rows="16"
              class="min-h-[280px] w-full resize-y rounded-md border border-input bg-background p-3 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="粘贴 cURL 命令、Postman Collection JSON 或 OpenAPI JSON / YAML"
            />
            <textarea
              v-else
              :value="interchangeExportPreview"
              data-testid="interchange-output"
              readonly
              rows="16"
              class="min-h-[280px] w-full resize-y rounded-md border border-input bg-muted/30 p-3 font-mono text-xs outline-none"
            />
            <p v-if="interchangeError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {{ interchangeError }}
            </p>
          </div>
          <div class="flex justify-end gap-2 border-t border-border px-4 py-3">
            <Button type="button" size="sm" variant="outline" :disabled="interchangeBusy" @click="closeInterchangeDialog">
              取消
            </Button>
            <Button
              v-if="interchangeMode === 'import'"
              type="button"
              size="sm"
              class="gap-2"
              :disabled="interchangeBusy || !interchangeContent.trim()"
              @click="runInterchangeImport"
            >
              <FileUp class="size-4" />
              {{ interchangeBusy ? '导入中…' : '导入到本地集合' }}
            </Button>
            <Button v-else type="button" size="sm" class="gap-2" :disabled="interchangeBusy" @click="saveInterchangeExport">
              <Download class="size-4" />
              {{ interchangeBusy ? '导出中…' : '保存文件' }}
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
