<script setup lang="ts">
import { format } from 'sql-formatter'
import { ref } from 'vue'
import ToolShell from '@/components/ToolShell.vue'
import { Button } from '@/components/ui/button'

const dialect = ref<'sql' | 'mysql' | 'postgresql' | 'sqlite' | 'transactsql'>('sql')
const keywordCase = ref<'preserve' | 'upper' | 'lower'>('upper')
const input = ref('select id,name from users where enabled=1 order by name;')
const output = ref('')
const error = ref('')

function run() {
  error.value = ''
  try {
    output.value = format(input.value, {
      language: dialect.value,
      keywordCase: keywordCase.value,
      tabWidth: 2,
    })
  }
  catch (e) {
    output.value = ''
    error.value = (e as Error).message
  }
}

function minify() {
  run()
  if (output.value)
    output.value = output.value.replace(/\s+/g, ' ').trim()
}
</script>

<template>
  <ToolShell title="SQL 格式化" desc="支持常见 SQL 方言、关键字风格与压缩">
    <div class="mb-3 flex flex-wrap gap-2">
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
      <Button size="sm" @click="run">
        格式化
      </Button><Button size="sm" variant="outline" @click="minify">
        压缩
      </Button>
    </div>
    <div class="grid gap-3 md:grid-cols-2">
      <textarea v-model="input" class="min-h-[360px] rounded-md border border-input bg-background p-3 font-mono text-sm" /><textarea :value="output" readonly class="min-h-[360px] rounded-md border border-input bg-muted/40 p-3 font-mono text-sm" />
    </div>
    <p v-if="error" class="mt-2 text-sm text-destructive">
      {{ error }}
    </p>
  </ToolShell>
</template>
