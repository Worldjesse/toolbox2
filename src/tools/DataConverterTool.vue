<script setup lang="ts">
import { XMLBuilder, XMLParser } from 'fast-xml-parser'
import Papa from 'papaparse'
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'
import { ref } from 'vue'
import YAML from 'yaml'
import ToolShell from '@/components/ToolShell.vue'
import { Button } from '@/components/ui/button'

type Format = 'json' | 'yaml' | 'toml' | 'xml' | 'csv'
const sourceFormat = ref<Format>('json')
const targetFormat = ref<Format>('yaml')
const input = ref('{\n  "name": "toolbox",\n  "version": 1\n}')
const output = ref('')
const error = ref('')
const formats: Format[] = ['json', 'yaml', 'toml', 'xml', 'csv']

function parseSource() {
  switch (sourceFormat.value) {
    case 'json': return JSON.parse(input.value)
    case 'yaml': return YAML.parse(input.value)
    case 'toml': return parseToml(input.value)
    case 'xml': return new XMLParser({ ignoreAttributes: false }).parse(input.value)
    case 'csv': {
      const parsed = Papa.parse<Record<string, unknown>>(input.value, { header: true, dynamicTyping: true, skipEmptyLines: true })
      if (parsed.errors.length)
        throw new Error(parsed.errors[0]?.message)
      return parsed.data
    }
  }
}

function stringifyTarget(value: unknown) {
  switch (targetFormat.value) {
    case 'json': return JSON.stringify(value, null, 2)
    case 'yaml': return YAML.stringify(value)
    case 'toml': return stringifyToml(value)
    case 'xml': return new XMLBuilder({ format: true, ignoreAttributes: false }).build(value)
    case 'csv': return Papa.unparse(value as Papa.UnparseObject<unknown> | unknown[])
  }
}

function convert() {
  error.value = ''
  try {
    output.value = stringifyTarget(parseSource())
  }
  catch (e) {
    output.value = ''
    error.value = (e as Error).message
  }
}

function swap() {
  const previousSource = sourceFormat.value
  sourceFormat.value = targetFormat.value
  targetFormat.value = previousSource
  if (output.value) {
    input.value = output.value
    output.value = ''
  }
}
</script>

<template>
  <ToolShell title="数据格式转换" desc="JSON、YAML、TOML、XML 与 CSV 互转">
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <select v-model="sourceFormat" class="h-9 rounded-md border border-input bg-background px-2 text-sm">
        <option v-for="format in formats" :key="format" :value="format">
          {{ format.toUpperCase() }}
        </option>
      </select>
      <Button size="sm" variant="ghost" title="交换格式" @click="swap">
        ⇄
      </Button>
      <select v-model="targetFormat" class="h-9 rounded-md border border-input bg-background px-2 text-sm">
        <option v-for="format in formats" :key="format" :value="format">
          {{ format.toUpperCase() }}
        </option>
      </select>
      <Button size="sm" @click="convert">
        转换
      </Button>
    </div>
    <div class="grid gap-3 md:grid-cols-2">
      <textarea v-model="input" class="min-h-[360px] rounded-md border border-input bg-background p-3 font-mono text-sm" />
      <textarea :value="output" readonly class="min-h-[360px] rounded-md border border-input bg-muted/40 p-3 font-mono text-sm" />
    </div>
    <p v-if="error" class="mt-2 text-sm text-destructive">
      {{ error }}
    </p>
  </ToolShell>
</template>
