<script setup lang="ts">
import { computed, ref } from 'vue'
import ToolShell from '@/components/ToolShell.vue'

const pattern = ref('(tool)(box)')
const flags = ref('gi')
const input = ref('Toolbox makes a useful developer toolbox.')
const replacement = ref('$1-$2')

const result = computed(() => {
  try {
    const normalizedFlags = flags.value.includes('g') ? flags.value : `${flags.value}g`
    const regex = new RegExp(pattern.value, normalizedFlags)
    const matches = [...input.value.matchAll(regex)].map((match, index) => ({
      index: index + 1,
      value: match[0],
      offset: match.index,
      groups: match.slice(1),
    }))
    return { error: '', matches, replaced: input.value.replace(regex, replacement.value) }
  }
  catch (e) {
    return { error: (e as Error).message, matches: [], replaced: '' }
  }
})
</script>

<template>
  <ToolShell title="正则测试" desc="匹配、捕获分组与替换预览">
    <div class="mb-3 grid gap-2 md:grid-cols-[1fr_8rem]">
      <input v-model="pattern" class="h-9 rounded-md border border-input bg-background px-3 font-mono text-sm" placeholder="正则表达式">
      <input v-model="flags" class="h-9 rounded-md border border-input bg-background px-3 font-mono text-sm" placeholder="flags">
    </div>
    <div class="grid gap-3 md:grid-cols-2">
      <textarea v-model="input" class="min-h-64 rounded-md border border-input bg-background p-3 font-mono text-sm" placeholder="测试文本..." />
      <div class="min-h-64 overflow-auto rounded-md border border-border bg-muted/30 p-3">
        <div class="mb-2 text-xs text-muted-foreground">
          匹配结果（{{ result.matches.length }}）
        </div>
        <div v-for="match in result.matches" :key="`${match.offset}-${match.index}`" class="mb-2 rounded-md border border-border bg-background p-2 font-mono text-xs">
          <div>#{{ match.index }} @ {{ match.offset }} · {{ match.value }}</div>
          <div v-if="match.groups.length" class="mt-1 text-muted-foreground">
            分组：{{ match.groups.join(' | ') }}
          </div>
        </div>
      </div>
    </div>
    <div class="mt-3 grid gap-2 md:grid-cols-2">
      <input v-model="replacement" class="h-9 rounded-md border border-input bg-background px-3 font-mono text-sm" placeholder="替换表达式">
      <div class="rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-sm">
        {{ result.replaced || '—' }}
      </div>
    </div>
    <p v-if="result.error" class="mt-2 text-sm text-destructive">
      {{ result.error }}
    </p>
  </ToolShell>
</template>
