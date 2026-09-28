<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { computed, ref } from 'vue'
import ToolShell from '@/components/ToolShell.vue'
import { Button } from '@/components/ui/button'

interface HashResult { path: string, hash: string, error?: string }
interface TextInfo { sizeBytes: number, encoding: string, lineEnding: string, lineCount: number }
interface DuplicateGroup { sizeBytes: number, hash: string, paths: string[] }
interface RenameItem { from: string, to: string }

const mode = ref<'hash' | 'inspect' | 'duplicates' | 'rename'>('hash')
const files = ref<string[]>([])
const directory = ref('')
const algorithm = ref('sha256')
const hashResults = ref<HashResult[]>([])
const textInfo = ref<TextInfo>()
const duplicateGroups = ref<DuplicateGroup[]>([])
const minSizeKb = ref(1)
const prefix = ref('')
const suffix = ref('')
const findText = ref('')
const replaceText = ref('')
const message = ref('')
const error = ref('')

const renamePreview = computed<RenameItem[]>(() => files.value.map((path) => {
  const separatorIndex = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  const directoryPart = separatorIndex >= 0 ? path.slice(0, separatorIndex + 1) : ''
  const filename = path.slice(separatorIndex + 1)
  const dotIndex = filename.lastIndexOf('.')
  const stem = dotIndex > 0 ? filename.slice(0, dotIndex) : filename
  const extension = dotIndex > 0 ? filename.slice(dotIndex) : ''
  const nextStem = `${prefix.value}${findText.value ? stem.replaceAll(findText.value, replaceText.value) : stem}${suffix.value}`
  return { from: path, to: `${directoryPart}${nextStem}${extension}` }
}))

async function pickFiles() {
  const selected = await open({ multiple: true, directory: false })
  if (Array.isArray(selected))
    files.value = selected
  else if (typeof selected === 'string')
    files.value = [selected]
}
async function pickDirectory() {
  const selected = await open({ multiple: false, directory: true })
  if (typeof selected === 'string')
    directory.value = selected
}
async function hashFiles() {
  error.value = ''
  try {
    hashResults.value = await invoke('calc_files_hash', { paths: files.value, algo: algorithm.value })
  }
  catch (e) {
    error.value = String(e)
  }
}
async function inspectFile() {
  error.value = ''
  try {
    textInfo.value = await invoke('inspect_text_file', { path: files.value[0] })
  }
  catch (e) {
    error.value = String(e)
  }
}
async function findDuplicates() {
  error.value = ''
  try {
    duplicateGroups.value = await invoke('find_duplicate_files', { directory: directory.value, minSize: minSizeKb.value * 1024 })
  }
  catch (e) {
    error.value = String(e)
  }
}
async function applyRename() {
  error.value = ''
  message.value = ''
  try {
    const count = await invoke<number>('rename_files', { items: renamePreview.value })
    message.value = `已处理 ${count} 个文件`
    files.value = renamePreview.value.map(item => item.to)
  }
  catch (e) {
    error.value = String(e)
  }
}
</script>

<template>
  <ToolShell title="批量文件工具" desc="批量哈希、文本检测、重复文件扫描与重命名">
    <div class="mb-4 flex flex-wrap gap-2">
      <button v-for="item in ['hash', 'inspect', 'duplicates', 'rename']" :key="item" type="button" class="rounded-md px-3 py-2 text-sm" :class="mode === item ? 'bg-primary text-primary-foreground' : 'bg-muted'" @click="mode = item as typeof mode">
        {{ { hash: '批量哈希', inspect: '文本检测', duplicates: '重复文件', rename: '批量重命名' }[item] }}
      </button>
    </div>
    <template v-if="mode === 'hash' || mode === 'inspect' || mode === 'rename'">
      <div class="mb-3 flex items-center gap-2">
        <Button size="sm" variant="outline" @click="pickFiles">
          选择文件
        </Button><span class="text-sm text-muted-foreground">已选择 {{ files.length }} 个</span>
      </div>
    </template>
    <template v-if="mode === 'hash'">
      <div class="mb-3 flex gap-2">
        <select v-model="algorithm" class="h-9 rounded-md border border-input bg-background px-2">
          <option value="md5">
            MD5
          </option><option value="sha256">
            SHA-256
          </option><option value="sha512">
            SHA-512
          </option>
        </select><Button size="sm" :disabled="!files.length" @click="hashFiles">
          计算
        </Button>
      </div><div class="space-y-2">
        <div v-for="result in hashResults" :key="result.path" class="rounded-md border border-border p-2 text-xs">
          <div class="truncate text-muted-foreground">
            {{ result.path }}
          </div><code class="break-all">{{ result.error || result.hash }}</code>
        </div>
      </div>
    </template>
    <template v-else-if="mode === 'inspect'">
      <Button size="sm" :disabled="files.length !== 1" @click="inspectFile">
        检测首个文件
      </Button><pre class="mt-3 rounded-md border border-border bg-muted/30 p-3 text-sm">{{ textInfo ? JSON.stringify(textInfo, null, 2) : '—' }}</pre>
    </template>
    <template v-else-if="mode === 'duplicates'">
      <div class="mb-3 flex flex-wrap gap-2">
        <input v-model="directory" class="h-9 min-w-64 flex-1 rounded-md border border-input bg-background px-3 text-sm" placeholder="目录"><Button size="sm" variant="outline" @click="pickDirectory">
          选择目录
        </Button><input v-model.number="minSizeKb" type="number" min="0" class="h-9 w-28 rounded-md border border-input bg-background px-3 text-sm" title="最小 KB"><Button size="sm" :disabled="!directory" @click="findDuplicates">
          扫描
        </Button>
      </div><div v-for="group in duplicateGroups" :key="group.hash" class="mb-2 rounded-md border border-border p-3">
        <div class="mb-2 text-xs text-muted-foreground">
          {{ group.sizeBytes }} bytes · {{ group.hash }}
        </div><div v-for="path in group.paths" :key="path" class="break-all font-mono text-xs">
          {{ path }}
        </div>
      </div>
    </template>
    <template v-else>
      <div class="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input v-model="prefix" class="h-9 rounded-md border border-input bg-background px-3 text-sm" placeholder="前缀"><input v-model="suffix" class="h-9 rounded-md border border-input bg-background px-3 text-sm" placeholder="后缀"><input v-model="findText" class="h-9 rounded-md border border-input bg-background px-3 text-sm" placeholder="查找"><input v-model="replaceText" class="h-9 rounded-md border border-input bg-background px-3 text-sm" placeholder="替换">
      </div><div class="max-h-72 overflow-auto rounded-md border border-border">
        <div v-for="item in renamePreview" :key="item.from" class="border-b border-border p-2 text-xs last:border-b-0">
          <div class="truncate text-muted-foreground">
            {{ item.from }}
          </div><div class="truncate font-medium">
            → {{ item.to }}
          </div>
        </div>
      </div><Button class="mt-3" size="sm" :disabled="!files.length" @click="applyRename">
        确认执行重命名
      </Button>
    </template>
    <p v-if="message" class="mt-3 text-sm text-emerald-600">
      {{ message }}
    </p><p v-if="error" class="mt-3 text-sm text-destructive">
      {{ error }}
    </p>
  </ToolShell>
</template>
