const fs = require("fs");
const path = "D:/tools/toolbox2/src/tools/HttpTool.vue";
let s = fs.readFileSync(path, "utf8");

const insertAfter = "const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const";
if (!s.includes(insertAfter)) {
  console.error("anchor missing");
  process.exit(1);
}

const suggestBlock = `
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

function filteredHeaderNames(input: string): string[] {
  const q = input.trim().toLowerCase()
  if (!q)
    return [...COMMON_HEADER_NAMES]
  return COMMON_HEADER_NAMES.filter(n => n.toLowerCase().includes(q))
}
`;

if (!s.includes("COMMON_HEADER_NAMES")) {
  s = s.replace(insertAfter, insertAfter + "\n" + suggestBlock);
}

// Replace headers template section with autocomplete UI
const oldHeadersBlock = `            <div v-else-if="reqTab === 'headers'" class="space-y-2">
              <div
                v-for="(row, idx) in headers"
                :key="idx"
                class="grid grid-cols-[24px_1fr_1fr_32px] items-center gap-2"
              >
                <input v-model="row.enabled" type="checkbox" class="size-4">
                <input
                  v-model="row.key"
                  placeholder="Header"
                  class="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs"
                >
                <input
                  v-model="row.value"
                  placeholder="Value"
                  class="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs"
                >
                <Button type="button" size="sm" variant="ghost" class="h-8 px-2" @click.stop="removeHeaderRow(idx)">
                  ×
                </Button>
              </div>
              <Button type="button" size="sm" variant="outline" @click.stop="addHeaderRow()">
                + Header
              </Button>
            </div>`;

const newHeadersBlock = `            <div v-else-if="reqTab === 'headers'" class="space-y-2">
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
                  :list="\`http-header-values-\${idx}\`"
                  placeholder="Value（可搜索）"
                  autocomplete="off"
                  class="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs"
                >
                <datalist :id="\`http-header-values-\${idx}\`">
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
            </div>`;

if (!s.includes(oldHeadersBlock)) {
  console.error("headers template block not found");
  // try to show nearby
  const i = s.indexOf("reqTab === 'headers'");
  console.log(s.slice(i, i + 400));
  process.exit(1);
}
s = s.replace(oldHeadersBlock, newHeadersBlock);

// add helper functions after removeHeaderRow
const afterRemove = `function removeHeaderRow(idx: number) {
  if (headers.value.length <= 1) {
    headers.value = [emptyKv()]
    return
  }
  headers.value.splice(idx, 1)
}`;

const helpers = `function removeHeaderRow(idx: number) {
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
}`;

if (!s.includes("function addPresetHeader")) {
  s = s.replace(afterRemove, helpers);
}

fs.writeFileSync(path, s);
console.log("ok");
console.log("has COMMON", s.includes("COMMON_HEADER_NAMES"));
console.log("has chips", s.includes("quickHeaderChips"));
console.log("has datalist", s.includes("http-header-names"));
