<script setup lang="ts">
import { CronExpressionParser } from 'cron-parser'
import { ref } from 'vue'
import ToolShell from '@/components/ToolShell.vue'
import { Button } from '@/components/ui/button'

const expression = ref('0 9 * * 1-5')
const timezone = ref('Asia/Shanghai')
const nextRuns = ref<string[]>([])
const error = ref('')

function calculate() {
  error.value = ''
  try {
    const interval = CronExpressionParser.parse(expression.value, { tz: timezone.value })
    nextRuns.value = Array.from({ length: 10 }, () => interval.next().toDate().toLocaleString('zh-CN', {
      hour12: false,
      timeZone: timezone.value,
    }))
  }
  catch (e) {
    nextRuns.value = []
    error.value = (e as Error).message
  }
}
</script>

<template>
  <ToolShell title="Cron 表达式" desc="校验表达式并预览后续执行时间">
    <div class="mb-3 grid gap-2 md:grid-cols-[1fr_14rem_auto]">
      <input v-model="expression" class="h-9 rounded-md border border-input bg-background px-3 font-mono text-sm" placeholder="0 9 * * 1-5">
      <input v-model="timezone" class="h-9 rounded-md border border-input bg-background px-3 font-mono text-sm" placeholder="Asia/Shanghai">
      <Button size="sm" @click="calculate">
        计算
      </Button>
    </div>
    <div class="mb-3 grid grid-cols-5 gap-2 text-center text-xs text-muted-foreground">
      <div>分钟</div><div>小时</div><div>日期</div><div>月份</div><div>星期</div>
    </div>
    <ol class="rounded-md border border-border bg-muted/30">
      <li v-for="(run, index) in nextRuns" :key="run" class="flex gap-3 border-b border-border px-3 py-2 font-mono text-sm last:border-b-0">
        <span class="w-6 text-muted-foreground">{{ index + 1 }}</span>{{ run }}
      </li>
      <li v-if="!nextRuns.length" class="px-3 py-8 text-center text-sm text-muted-foreground">
        输入表达式后计算
      </li>
    </ol>
    <p v-if="error" class="mt-2 text-sm text-destructive">
      {{ error }}
    </p>
  </ToolShell>
</template>
