<script setup lang="ts">
import { ref } from 'vue'
import ToolShell from '@/components/ToolShell.vue'
import { Button } from '@/components/ui/button'
import { useToolDraft } from '@/composables/useToolDraft'

const input = useToolDraft('base64', 'input', '')
const output = ref('')
const error = ref('')

function encode() {
  error.value = ''
  try {
    output.value = btoa(unescape(encodeURIComponent(input.value)))
  }
  catch (e) {
    error.value = (e as Error).message
  }
}

function decode() {
  error.value = ''
  try {
    output.value = decodeURIComponent(escape(atob(input.value)))
  }
  catch (e) {
    error.value = `解码失败: ${(e as Error).message}`
  }
}

async function copyOut() {
  if (output.value)
    await navigator.clipboard.writeText(output.value)
}
</script>

<template>
  <ToolShell title="Base64 编解码" desc="支持 UTF-8 中文">
    <div class="mb-3 flex flex-wrap gap-2">
      <Button size="sm" @click="encode">
        编码 →
      </Button>
      <Button size="sm" @click="decode">
        ← 解码
      </Button>
      <Button size="sm" variant="ghost" @click="copyOut">
        复制
      </Button>
    </div>
    <div class="grid gap-3 md:grid-cols-2">
      <textarea
        v-model="input"
        class="min-h-[300px] w-full resize-y rounded-md border border-input bg-background p-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        placeholder="输入原文或 Base64..."
      />
      <textarea
        :value="output"
        readonly
        class="min-h-[300px] w-full resize-y rounded-md border border-input bg-muted/40 p-3 font-mono text-sm outline-none"
        placeholder="结果..."
      />
    </div>
    <p v-if="error" class="mt-2 text-sm text-destructive">
      ⚠ {{ error }}
    </p>
  </ToolShell>
</template>
