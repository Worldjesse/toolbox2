<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { ref } from 'vue'
import ToolShell from '@/components/ToolShell.vue'
import { Button } from '@/components/ui/button'

type Algorithm = 'md5' | 'sha256' | 'sha512'
const input = ref('')
const key = ref('')
const algorithm = ref<Algorithm>('sha256')
const mode = ref<'hash' | 'hmac'>('hash')
const output = ref('')
const error = ref('')

async function calculate() {
  error.value = ''
  try {
    output.value = mode.value === 'hash'
      ? await invoke<string>('calc_text_hash', { text: input.value, algo: algorithm.value })
      : await invoke<string>('calc_hmac', { text: input.value, key: key.value, algo: algorithm.value })
  }
  catch (e) {
    output.value = ''
    error.value = String(e)
  }
}
</script>

<template>
  <ToolShell title="Hash / HMAC" desc="使用 Rust 在本地计算文本摘要和消息认证码">
    <div class="mb-3 flex flex-wrap gap-2">
      <select v-model="mode" class="h-9 rounded-md border border-input bg-background px-2 text-sm">
        <option value="hash">
          Hash
        </option><option value="hmac">
          HMAC
        </option>
      </select>
      <select v-model="algorithm" class="h-9 rounded-md border border-input bg-background px-2 text-sm">
        <option value="md5">
          MD5
        </option><option value="sha256">
          SHA-256
        </option><option value="sha512">
          SHA-512
        </option>
      </select>
      <Button size="sm" @click="calculate">
        计算
      </Button>
    </div>
    <input v-if="mode === 'hmac'" v-model="key" type="password" class="mb-3 h-9 w-full rounded-md border border-input bg-background px-3 font-mono text-sm" placeholder="HMAC 密钥（不会保存）">
    <textarea v-model="input" class="min-h-64 w-full rounded-md border border-input bg-background p-3 font-mono text-sm" placeholder="输入文本..." />
    <div class="mt-3 rounded-md border border-border bg-muted/40 p-3 font-mono text-sm break-all">
      {{ output || '—' }}
    </div>
    <p v-if="error" class="mt-2 text-sm text-destructive">
      {{ error }}
    </p>
  </ToolShell>
</template>
