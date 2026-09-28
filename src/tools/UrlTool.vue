<script setup lang="ts">
import { computed, ref } from 'vue'
import ToolShell from '@/components/ToolShell.vue'
import { Button } from '@/components/ui/button'

const input = ref('https://example.com/path?name=toolbox&debug=true#result')
const mode = ref<'parse' | 'encode' | 'decode'>('parse')
const output = ref('')
const error = ref('')

const parsed = computed(() => {
  if (mode.value !== 'parse' || !output.value)
    return null
  try {
    return JSON.parse(output.value) as { query: Record<string, string> }
  }
  catch {
    return null
  }
})

function run() {
  error.value = ''
  try {
    if (mode.value === 'encode') {
      output.value = encodeURIComponent(input.value)
      return
    }
    if (mode.value === 'decode') {
      output.value = decodeURIComponent(input.value)
      return
    }
    const url = new URL(input.value)
    output.value = JSON.stringify({
      protocol: url.protocol,
      username: url.username,
      password: url.password ? '***' : '',
      hostname: url.hostname,
      port: url.port,
      pathname: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      hash: url.hash,
      origin: url.origin,
    }, null, 2)
  }
  catch (e) {
    output.value = ''
    error.value = (e as Error).message
  }
}
</script>

<template>
  <ToolShell title="URL 工具" desc="解析 URL、Query 参数以及 URI 编解码">
    <div class="mb-3 flex flex-wrap gap-2">
      <select v-model="mode" class="h-9 rounded-md border border-input bg-background px-2 text-sm">
        <option value="parse">
          解析 URL
        </option><option value="encode">
          URI 编码
        </option><option value="decode">
          URI 解码
        </option>
      </select>
      <Button size="sm" @click="run">
        执行
      </Button>
    </div>
    <div class="grid gap-3 md:grid-cols-2">
      <textarea v-model="input" class="min-h-72 rounded-md border border-input bg-background p-3 font-mono text-sm" placeholder="输入 URL 或文本..." />
      <textarea :value="output" readonly class="min-h-72 rounded-md border border-input bg-muted/40 p-3 font-mono text-sm" placeholder="结果..." />
    </div>
    <div v-if="parsed?.query && Object.keys(parsed.query).length" class="mt-3 overflow-auto rounded-md border border-border">
      <table class="w-full text-sm">
        <thead class="bg-muted">
          <tr>
            <th class="px-3 py-2 text-left">
              参数
            </th><th class="px-3 py-2 text-left">
              值
            </th>
          </tr>
        </thead><tbody>
          <tr v-for="(value, key) in parsed.query" :key="key" class="border-t border-border">
            <td class="px-3 py-2 font-mono">
              {{ key }}
            </td><td class="px-3 py-2 font-mono">
              {{ value }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="error" class="mt-2 text-sm text-destructive">
      {{ error }}
    </p>
  </ToolShell>
</template>
