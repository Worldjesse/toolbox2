<script setup lang="ts">
import { Braces, ChevronDown, Copy, Database, Play, PlugZap, RefreshCw, Save, Search, Settings2, Table2, Trash2, X } from '@lucide/vue'
import { invoke } from '@tauri-apps/api/core'
import { format } from 'sql-formatter'
import { computed, onMounted, ref } from 'vue'
import ToolShell from '@/components/ToolShell.vue'
import { Button } from '@/components/ui/button'
import { useSettingsStore } from '@/stores/settings'

type Mode = 'format' | 'query'
type Dialect = 'sql' | 'mysql' | 'postgresql' | 'sqlite' | 'transactsql'

interface MysqlConnection {
  host: string
  port: number
  username: string
  password: string
  database?: string
}

interface ConnectionResult {
  serverVersion: string
  database?: string | null
  durationMs: number
}

interface DatabaseInfo {
  name: string
  tables: string[]
}

interface QueryResult {
  columns: string[]
  rows: unknown[][]
  rowCount: number
  truncated: boolean
  durationMs: number
}

interface SavedConnection {
  id: string
  name: string
  host: string
  port: number
  username: string
  password?: string
  database: string
  lastUsedAt: number
}

const CONNECTIONS_KEY = 'sql.connections'
const LAST_CONNECTION_KEY = 'sql.lastConnectionId'
const settings = useSettingsStore()

const mode = ref<Mode>('format')
const dialect = ref<Dialect>('sql')
const keywordCase = ref<'preserve' | 'upper' | 'lower'>('upper')
const input = ref('select id,name from users where enabled=1 order by name;')
const output = ref('')
const error = ref('')

const host = ref('127.0.0.1')
const port = ref(3306)
const username = ref('root')
const password = ref('')
const database = ref('')
const connectionName = ref('')
const savedConnections = ref<SavedConnection[]>([])
const selectedConnectionId = ref('')
const profileStatus = ref('')
const querySql = ref('SELECT VERSION() AS version, DATABASE() AS current_database;')
const maxRows = ref(500)
const connecting = ref(false)
const querying = ref(false)
const connected = ref<ConnectionResult | null>(null)
const catalog = ref<DatabaseInfo[]>([])
const expandedDatabases = ref(new Set<string>())
const objectFilter = ref('')
const queryResult = ref<QueryResult | null>(null)
const connectionPanelOpen = ref(true)

const connection = computed<MysqlConnection>(() => ({
  host: host.value.trim(),
  port: port.value,
  username: username.value.trim(),
  password: password.value,
  database: database.value.trim() || undefined,
}))

const filteredCatalog = computed(() => {
  const term = objectFilter.value.trim().toLocaleLowerCase()
  if (!term)
    return catalog.value
  return catalog.value
    .map((item) => {
      if (item.name.toLocaleLowerCase().includes(term))
        return item
      return {
        ...item,
        tables: item.tables.filter(table => table.toLocaleLowerCase().includes(term)),
      }
    })
    .filter(item => item.tables.length > 0 || item.name.toLocaleLowerCase().includes(term))
})

const visibleTableCount = computed(() => filteredCatalog.value.reduce((total, item) => total + item.tables.length, 0))

onMounted(async () => {
  savedConnections.value = (await settings.getSetting<SavedConnection[]>(CONNECTIONS_KEY) ?? [])
    .sort((left, right) => right.lastUsedAt - left.lastUsedAt)
  const lastConnectionId = await settings.getSetting<string>(LAST_CONNECTION_KEY)
  if (lastConnectionId && savedConnections.value.some(item => item.id === lastConnectionId)) {
    selectedConnectionId.value = lastConnectionId
    loadSavedConnection(lastConnectionId)
  }
})

function runFormatter() {
  error.value = ''
  try {
    output.value = format(input.value, {
      language: dialect.value,
      keywordCase: keywordCase.value,
      tabWidth: 2,
    })
  }
  catch (cause) {
    output.value = ''
    error.value = (cause as Error).message
  }
}

function minify() {
  runFormatter()
  if (output.value)
    output.value = output.value.replace(/\s+/g, ' ').trim()
}

function errorMessage(cause: unknown) {
  const message = String(cause)
  return message.startsWith('Error: ') ? message.slice(7) : message
}

function defaultConnectionName() {
  const databaseSuffix = database.value.trim() ? ` / ${database.value.trim()}` : ''
  return `${username.value.trim()}@${host.value.trim()}:${port.value}${databaseSuffix}`
}

function loadSavedConnection(id: string) {
  const profile = savedConnections.value.find(item => item.id === id)
  if (!profile)
    return
  connectionName.value = profile.name
  host.value = profile.host
  port.value = profile.port
  username.value = profile.username
  password.value = profile.password ?? ''
  database.value = profile.database
  connected.value = null
  catalog.value = []
  queryResult.value = null
  objectFilter.value = ''
  profileStatus.value = profile.password ? '已载入连接，可直接连接' : '已载入连接，请输入密码后重新保存'
  void settings.setSetting(LAST_CONNECTION_KEY, profile.id)
}

function onSavedConnectionChange() {
  if (selectedConnectionId.value) {
    loadSavedConnection(selectedConnectionId.value)
    return
  }
  connectionName.value = ''
  host.value = '127.0.0.1'
  port.value = 3306
  username.value = 'root'
  password.value = ''
  database.value = ''
  connected.value = null
  catalog.value = []
  profileStatus.value = '新建连接'
}

async function saveCurrentConnection() {
  if (!host.value.trim() || !username.value.trim())
    throw new Error('主机和用户名不能为空')
  const now = Date.now()
  const exactMatch = savedConnections.value.find(item => (
    item.host === host.value.trim()
    && item.port === port.value
    && item.username === username.value.trim()
    && item.database === database.value.trim()
  ))
  const id = selectedConnectionId.value || exactMatch?.id || crypto.randomUUID()
  const previous = savedConnections.value.find(item => item.id === id)
  const profile: SavedConnection = {
    id,
    name: connectionName.value.trim() || previous?.name || defaultConnectionName(),
    host: host.value.trim(),
    port: port.value,
    username: username.value.trim(),
    password: password.value,
    database: database.value.trim(),
    lastUsedAt: now,
  }
  savedConnections.value = [
    profile,
    ...savedConnections.value.filter(item => item.id !== id),
  ]
  selectedConnectionId.value = id
  connectionName.value = profile.name
  await settings.setSetting(CONNECTIONS_KEY, savedConnections.value)
  await settings.setSetting(LAST_CONNECTION_KEY, id)
  profileStatus.value = '连接配置和密码已保存到本机'
}

async function removeCurrentConnection() {
  const id = selectedConnectionId.value
  if (!id)
    return
  savedConnections.value = savedConnections.value.filter(item => item.id !== id)
  selectedConnectionId.value = ''
  await settings.setSetting(CONNECTIONS_KEY, savedConnections.value)
  await settings.setSetting(LAST_CONNECTION_KEY, '')
  profileStatus.value = '已删除保存的连接，当前输入仍保留'
}

async function saveCurrentConnectionFromUi() {
  error.value = ''
  try {
    await saveCurrentConnection()
  }
  catch (cause) {
    error.value = errorMessage(cause)
  }
}

async function removeCurrentConnectionFromUi() {
  error.value = ''
  try {
    await removeCurrentConnection()
  }
  catch (cause) {
    error.value = errorMessage(cause)
  }
}

async function loadCatalog() {
  catalog.value = await invoke<DatabaseInfo[]>('mysql_catalog', { input: connection.value })
  const selected = catalog.value.find(item => item.name === database.value)
  if (selected)
    expandedDatabases.value = new Set([selected.name])
}

async function testConnection() {
  error.value = ''
  connected.value = null
  queryResult.value = null
  connecting.value = true
  try {
    connected.value = await invoke<ConnectionResult>('mysql_test_connection', { input: connection.value })
    await loadCatalog()
    connectionPanelOpen.value = false
    try {
      await saveCurrentConnection()
    }
    catch (cause) {
      profileStatus.value = `已连接，但保存配置失败：${errorMessage(cause)}`
    }
  }
  catch (cause) {
    catalog.value = []
    error.value = errorMessage(cause)
  }
  finally {
    connecting.value = false
  }
}

async function refreshCatalog() {
  error.value = ''
  connecting.value = true
  try {
    await loadCatalog()
  }
  catch (cause) {
    error.value = errorMessage(cause)
  }
  finally {
    connecting.value = false
  }
}

function toggleDatabase(name: string) {
  const next = new Set(expandedDatabases.value)
  if (next.has(name))
    next.delete(name)
  else
    next.add(name)
  expandedDatabases.value = next
  database.value = name
}

function isDatabaseExpanded(name: string) {
  return Boolean(objectFilter.value.trim()) || expandedDatabases.value.has(name)
}

function quoteIdentifier(value: string) {
  return `\`${value.replaceAll('`', '``')}\``
}

function selectTable(databaseName: string, table: string) {
  database.value = databaseName
  querySql.value = `SELECT *\nFROM ${quoteIdentifier(databaseName)}.${quoteIdentifier(table)}\nLIMIT 100;`
}

async function executeQuery() {
  error.value = ''
  queryResult.value = null
  if (!querySql.value.trim()) {
    error.value = '请输入 SQL'
    return
  }
  querying.value = true
  try {
    queryResult.value = await invoke<QueryResult>('mysql_query', {
      input: {
        connection: connection.value,
        sql: querySql.value,
        maxRows: maxRows.value,
      },
    })
  }
  catch (cause) {
    error.value = errorMessage(cause)
  }
  finally {
    querying.value = false
  }
}

function displayCell(value: unknown) {
  if (value === null)
    return 'NULL'
  if (typeof value === 'object')
    return JSON.stringify(value)
  return String(value)
}

async function copyResults() {
  if (!queryResult.value)
    return
  const lines = [queryResult.value.columns, ...queryResult.value.rows]
    .map(row => row.map(displayCell).join('\t'))
  await navigator.clipboard.writeText(lines.join('\n'))
}

function onQueryKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    executeQuery()
  }
}
</script>

<template>
  <ToolShell title="SQL 工作台" desc="格式化 SQL，或连接 MySQL 执行安全的只读查询">
    <div class="flex min-h-full flex-col gap-3">
      <div class="inline-flex w-fit rounded-md border border-border bg-muted/40 p-1">
        <button type="button" class="flex h-8 items-center gap-2 rounded px-3 text-sm" :class="mode === 'format' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'" @click="mode = 'format'">
          <Braces class="size-4" />
          SQL 格式化
        </button>
        <button type="button" class="flex h-8 items-center gap-2 rounded px-3 text-sm" :class="mode === 'query' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'" @click="mode = 'query'">
          <Database class="size-4" />
          数据库查询
        </button>
      </div>

      <template v-if="mode === 'format'">
        <div class="flex flex-wrap gap-2">
          <select v-model="dialect" class="h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="sql">
              Standard SQL
            </option><option value="mysql">
              MySQL
            </option><option value="postgresql">
              PostgreSQL
            </option><option value="sqlite">
              SQLite
            </option><option value="transactsql">
              SQL Server
            </option>
          </select>
          <select v-model="keywordCase" class="h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="upper">
              关键字大写
            </option><option value="lower">
              关键字小写
            </option><option value="preserve">
              保持原样
            </option>
          </select>
          <Button size="sm" @click="runFormatter">
            格式化
          </Button><Button size="sm" variant="outline" @click="minify">
            压缩
          </Button>
        </div>
        <div class="grid gap-3 md:grid-cols-2">
          <textarea v-model="input" class="min-h-[360px] resize-y rounded-md border border-input bg-background p-3 font-mono text-sm" />
          <textarea :value="output" readonly class="min-h-[360px] resize-y rounded-md border border-input bg-muted/40 p-3 font-mono text-sm" />
        </div>
      </template>

      <template v-else>
        <section class="overflow-hidden rounded-md border border-border bg-background">
          <div class="flex min-h-12 flex-wrap items-center gap-2 px-3 py-2">
            <span class="flex items-center gap-2 text-xs font-medium" :class="connected ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'">
              <span class="size-2 rounded-full" :class="connected ? 'bg-emerald-500 shadow-[0_0_0_3px_oklch(0.72_0.16_160/0.14)]' : 'bg-muted-foreground/40'" />
              {{ connected ? '已连接' : '未连接' }}
            </span>
            <select v-model="selectedConnectionId" class="h-8 min-w-[220px] max-w-sm flex-1 rounded-md border border-input bg-background px-2 text-sm text-foreground" aria-label="已保存连接" @change="onSavedConnectionChange">
              <option value="">
                + 新建连接
              </option>
              <option v-for="profile in savedConnections" :key="profile.id" :value="profile.id">
                {{ profile.name }}
              </option>
            </select>
            <span v-if="connected" class="hidden text-xs text-muted-foreground xl:inline">
              MySQL {{ connected.serverVersion }} · {{ connected.durationMs }} ms
            </span>
            <div class="ml-auto flex items-center gap-1.5">
              <Button size="sm" variant="ghost" class="size-8 p-0" title="刷新数据库" :disabled="!connected || connecting" @click="refreshCatalog">
                <RefreshCw class="size-4" :class="connecting ? 'animate-spin' : ''" />
              </Button>
              <Button size="sm" variant="outline" class="h-8 gap-2" @click="connectionPanelOpen = !connectionPanelOpen">
                <Settings2 class="size-4" />
                连接设置
                <ChevronDown class="size-3.5 transition-transform" :class="connectionPanelOpen ? 'rotate-180' : ''" />
              </Button>
              <Button size="sm" class="h-8 gap-2" :disabled="connecting" @click="testConnection">
                <PlugZap class="size-4" />{{ connecting ? '连接中' : connected ? '重新连接' : '连接数据库' }}
              </Button>
            </div>
          </div>

          <div v-if="connectionPanelOpen" class="border-t border-border bg-muted/15 p-3">
            <div class="mb-3 flex flex-wrap items-end gap-2">
              <label class="grid min-w-[220px] flex-1 gap-1 text-xs text-muted-foreground">
                连接名称
                <input v-model="connectionName" placeholder="例如：OMS 测试库" class="h-9 min-w-0 rounded-md border border-input bg-background px-2 text-sm text-foreground">
              </label>
              <Button size="sm" variant="outline" class="h-9 gap-2" title="保存当前连接配置" @click="saveCurrentConnectionFromUi">
                <Save class="size-4" />
                保存连接
              </Button>
              <Button size="sm" variant="ghost" class="size-9 p-0" title="删除当前保存的连接" :disabled="!selectedConnectionId" @click="removeCurrentConnectionFromUi">
                <Trash2 class="size-4" />
              </Button>
            </div>
            <div class="grid gap-2 md:grid-cols-[minmax(140px,1.4fr)_90px_minmax(120px,1fr)_minmax(120px,1fr)_minmax(140px,1fr)]">
              <label class="grid gap-1 text-xs text-muted-foreground">主机<input v-model="host" class="h-9 min-w-0 rounded-md border border-input bg-background px-2 font-mono text-sm text-foreground"></label>
              <label class="grid gap-1 text-xs text-muted-foreground">端口<input v-model.number="port" type="number" min="1" max="65535" class="h-9 min-w-0 rounded-md border border-input bg-background px-2 font-mono text-sm text-foreground"></label>
              <label class="grid gap-1 text-xs text-muted-foreground">用户名<input v-model="username" autocomplete="off" class="h-9 min-w-0 rounded-md border border-input bg-background px-2 font-mono text-sm text-foreground"></label>
              <label class="grid gap-1 text-xs text-muted-foreground">密码<input v-model="password" type="password" autocomplete="new-password" class="h-9 min-w-0 rounded-md border border-input bg-background px-2 font-mono text-sm text-foreground"></label>
              <label class="grid gap-1 text-xs text-muted-foreground">默认数据库<input v-model="database" placeholder="可选" class="h-9 min-w-0 rounded-md border border-input bg-background px-2 font-mono text-sm text-foreground"></label>
            </div>
            <div class="mt-2 flex flex-wrap justify-between gap-2 text-[11px] text-muted-foreground">
              <span v-if="profileStatus">{{ profileStatus }}</span>
              <span class="ml-auto">密码仅存储在本机 settings.json</span>
            </div>
          </div>
        </section>

        <div class="grid min-h-[520px] flex-1 overflow-hidden rounded-md border border-border bg-background lg:h-[calc(100dvh-16rem)] lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside class="flex max-h-80 min-h-0 flex-col border-b border-border bg-muted/10 lg:max-h-none lg:border-b-0 lg:border-r">
            <div class="border-b border-border p-3">
              <div class="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div class="text-sm font-semibold">
                    对象浏览器
                  </div>
                  <div class="mt-0.5 text-[11px] text-muted-foreground">
                    {{ catalog.length }} 个数据库 · {{ catalog.reduce((total, item) => total + item.tables.length, 0) }} 张表
                  </div>
                </div>
                <Button size="sm" variant="ghost" class="size-8 p-0" title="刷新数据库" :disabled="!connected || connecting" @click="refreshCatalog">
                  <RefreshCw class="size-4" :class="connecting ? 'animate-spin' : ''" />
                </Button>
              </div>
              <div class="relative">
                <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input v-model="objectFilter" placeholder="搜索数据库或表" class="h-9 w-full rounded-md border border-input bg-background pl-8 pr-8 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <button v-if="objectFilter" type="button" title="清除搜索" class="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded hover:bg-muted" @click="objectFilter = ''">
                  <X class="size-3.5" />
                </button>
              </div>
              <p v-if="objectFilter" class="mt-2 text-[11px] text-muted-foreground">
                找到 {{ filteredCatalog.length }} 个数据库，{{ visibleTableCount }} 张表
              </p>
            </div>

            <div class="min-h-0 flex-1 overflow-auto p-2">
              <div v-if="!catalog.length" class="grid min-h-40 place-items-center px-4 text-center text-xs text-muted-foreground">
                <div>
                  <Database class="mx-auto mb-2 size-6 opacity-50" />
                  连接数据库后显示对象
                </div>
              </div>
              <div v-else-if="!filteredCatalog.length" class="grid min-h-40 place-items-center px-4 text-center text-xs text-muted-foreground">
                <div>
                  <Search class="mx-auto mb-2 size-6 opacity-50" />
                  没有匹配的数据库或表
                </div>
              </div>
              <div v-for="item in filteredCatalog" :key="item.name" class="mb-0.5">
                <button type="button" class="flex h-8 w-full items-center gap-2 rounded px-2 text-left font-mono text-xs transition-colors hover:bg-muted" :class="database === item.name ? 'bg-accent text-accent-foreground' : ''" @click="toggleDatabase(item.name)">
                  <Database class="size-4 shrink-0" :class="database === item.name ? 'text-primary' : 'text-muted-foreground'" /><span class="min-w-0 flex-1 truncate">{{ item.name }}</span><span class="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{{ item.tables.length }}</span>
                </button>
                <div v-if="isDatabaseExpanded(item.name)" class="ml-4 border-l border-border pl-1.5">
                  <button v-for="table in item.tables" :key="table" type="button" class="flex h-7 w-full items-center gap-2 rounded px-2 text-left font-mono text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" :title="`${item.name}.${table}`" @click="selectTable(item.name, table)">
                    <Table2 class="size-3.5 shrink-0" /><span class="truncate">{{ table }}</span>
                  </button>
                </div>
              </div>
            </div>
          </aside>

          <section class="grid min-h-0 min-w-0 grid-rows-[auto_190px_minmax(220px,1fr)]">
            <div class="flex flex-wrap items-center gap-2 border-b border-border bg-muted/15 px-3 py-2">
              <Button class="gap-2" size="sm" title="运行查询 (Ctrl+Enter)" :disabled="querying" @click="executeQuery">
                <Play class="size-4 fill-current" />{{ querying ? '执行中' : '运行查询' }}
              </Button>
              <span v-if="database" class="rounded-md bg-secondary px-2 py-1 font-mono text-xs text-secondary-foreground">
                {{ database }}
              </span>
              <label class="ml-auto flex items-center gap-2 text-xs text-muted-foreground">最大行数<input v-model.number="maxRows" type="number" min="1" max="5000" class="h-8 w-20 rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground"></label>
            </div>
            <textarea v-model="querySql" spellcheck="false" aria-label="SQL 查询编辑器" class="min-h-0 resize-none border-0 border-b border-border bg-background p-4 font-mono text-sm leading-relaxed outline-none focus:ring-0" @keydown="onQueryKeydown" />

            <div class="min-h-0 overflow-hidden">
              <div class="flex h-10 items-center justify-between border-b border-border bg-muted/20 px-3">
                <div class="flex items-center gap-3 text-xs text-muted-foreground">
                  <span class="font-medium text-foreground">查询结果</span>
                  <template v-if="queryResult">
                    <span>{{ queryResult.rowCount }} 行</span><span>{{ queryResult.durationMs }} ms</span><span v-if="queryResult.truncated" class="text-amber-600 dark:text-amber-400">结果已截断</span>
                  </template>
                </div>
                <Button size="sm" variant="ghost" class="size-8 p-0" title="复制为 TSV" :disabled="!queryResult" @click="copyResults">
                  <Copy class="size-4" />
                </Button>
              </div>
              <div class="h-[calc(100%-2.5rem)] overflow-auto">
                <table v-if="queryResult?.columns.length" class="w-max min-w-full border-collapse text-left font-mono text-xs">
                  <thead class="sticky top-0 z-10 bg-muted">
                    <tr>
                      <th class="w-12 border-b border-r border-border px-2 py-2 text-right font-medium text-muted-foreground">
                        #
                      </th><th v-for="column in queryResult.columns" :key="column" class="min-w-[120px] border-b border-r border-border px-3 py-2 font-semibold">
                        {{ column }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, rowIndex) in queryResult.rows" :key="rowIndex" class="hover:bg-muted/40">
                      <td class="border-b border-r border-border/60 px-2 py-1.5 text-right text-muted-foreground">
                        {{ rowIndex + 1 }}
                      </td><td v-for="(cell, cellIndex) in row" :key="cellIndex" class="max-w-[360px] truncate border-b border-r border-border/60 px-3 py-1.5" :class="cell === null ? 'italic text-muted-foreground' : ''" :title="displayCell(cell)">
                        {{ displayCell(cell) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div v-else class="grid h-full min-h-[180px] place-items-center text-sm text-muted-foreground">
                  {{ querying ? '正在执行查询…' : '运行查询后在此查看结果' }}
                </div>
              </div>
            </div>
          </section>
        </div>
      </template>

      <p v-if="error" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        {{ error }}
      </p>
    </div>
  </ToolShell>
</template>
