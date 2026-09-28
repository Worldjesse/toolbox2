<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { ref } from 'vue'
import ToolShell from '@/components/ToolShell.vue'
import { Button } from '@/components/ui/button'
import { useToolDraft } from '@/composables/useToolDraft'

const filePath = ref('')
const content = ref('')
const hash = ref('')
const algo = useToolDraft<'md5' | 'sha256' | 'sha512'>('file', 'algorithm', 'sha256')
const error = ref('')

async function pickFile() {
  error.value = ''
  try {
    const selected = await open({
      multiple: false,
      directory: false,
    })
    if (typeof selected === 'string')
      filePath.value = selected
  }
  catch (e) {
    error.value = String(e)
  }
}

async function readFile() {
  error.value = ''
  if (!filePath.value) {
    error.value = '请输入或选择文件路径'
    return
  }
  try {
    content.value = await invoke<string>('read_text_file', { path: filePath.value })
  }
  catch (e) {
    error.value = String(e)
  }
}

async function calc() {
  error.value = ''
  if (!filePath.value) {
    error.value = '请输入或选择文件路径'
    return
  }
  try {
    hash.value = await invoke<string>('calc_file_hash', {
      path: filePath.value,
      algo: algo.value,
    })
  }
  catch (e) {
    error.value = String(e)
  }
}

async function copyHash() {
  if (hash.value)
    await navigator.clipboard.writeText(hash.value)
}
</script>

<template>
  <ToolShell title="文件工具" desc="读取文本文件 / 计算文件哈希（Rust 后端）">
    <div class="mb-3 flex flex-wrap gap-2">
      <input
        v-model="filePath"
        placeholder="文件绝对路径，如 D:/a.txt"
        class="h-9 min-w-[220px] flex-1 rounded-md border border-input bg-background px-3 font-mono text-sm"
      >
      <Button size="sm" variant="outline" @click="pickFile">
        选择文件
      </Button>
    </div>
    <div class="mb-3 flex flex-wrap gap-2">
      <Button size="sm" @click="readFile">
        读取文本
      </Button>
      <select
        v-model="algo"
        class="h-9 rounded-md border border-input bg-background px-2 text-sm"
      >
        <option value="md5">
          MD5
        </option>
        <option value="sha256">
          SHA-256
        </option>
        <option value="sha512">
          SHA-512
        </option>
      </select>
      <Button size="sm" @click="calc">
        计算哈希
      </Button>
      <Button size="sm" variant="ghost" @click="copyHash">
        复制
      </Button>
    </div>
    <div class="grid gap-3 md:grid-cols-2">
      <textarea
        :value="content"
        readonly
        class="min-h-[260px] w-full resize-y rounded-md border border-input bg-muted/40 p-3 font-mono text-sm outline-none"
        placeholder="文件内容..."
      />
      <div class="flex min-h-[260px] flex-col gap-2 rounded-md border border-border bg-muted/40 p-3">
        <div class="text-xs text-muted-foreground">
          哈希结果 ({{ algo }})
        </div>
        <code class="break-all font-mono text-xs leading-relaxed">{{ hash || '—' }}</code>
      </div>
    </div>
    <p v-if="error" class="mt-2 text-sm text-destructive">
      ⚠ {{ error }}
    </p>
  </ToolShell>
</template>
