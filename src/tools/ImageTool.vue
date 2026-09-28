<script setup lang="ts">
import { ref } from 'vue'
import ToolShell from '@/components/ToolShell.vue'
import { Button } from '@/components/ui/button'

const sourceUrl = ref('')
const outputUrl = ref('')
const filename = ref('image')
const width = ref(0)
const height = ref(0)
const sourceSize = ref(0)
const outputSize = ref(0)
const format = ref<'image/png' | 'image/jpeg' | 'image/webp'>('image/webp')
const quality = ref(0.82)
let sourceImage: HTMLImageElement | undefined

function load(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file)
    return
  filename.value = file.name.replace(/\.[^.]+$/, '')
  sourceSize.value = file.size
  sourceUrl.value = URL.createObjectURL(file)
  const image = new Image()
  image.onload = () => {
    sourceImage = image
    width.value = image.naturalWidth
    height.value = image.naturalHeight
  }
  image.src = sourceUrl.value
}

function convert() {
  if (!sourceImage)
    return
  const canvas = document.createElement('canvas')
  canvas.width = width.value
  canvas.height = height.value
  const context = canvas.getContext('2d')
  if (!context)
    return
  context.drawImage(sourceImage, 0, 0, width.value, height.value)
  canvas.toBlob((blob) => {
    if (!blob)
      return
    if (outputUrl.value)
      URL.revokeObjectURL(outputUrl.value)
    outputUrl.value = URL.createObjectURL(blob)
    outputSize.value = blob.size
  }, format.value, quality.value)
}

function download() {
  if (!outputUrl.value)
    return
  const extension = format.value.split('/')[1]
  const anchor = document.createElement('a')
  anchor.href = outputUrl.value
  anchor.download = `${filename.value}.${extension}`
  anchor.click()
}
</script>

<template>
  <ToolShell title="图片工具" desc="查看尺寸、压缩并转换 PNG、JPEG、WebP">
    <input type="file" accept="image/*" class="mb-3 block w-full text-sm" @change="load">
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <select v-model="format" class="h-9 rounded-md border border-input bg-background px-2 text-sm">
        <option value="image/png">
          PNG
        </option><option value="image/jpeg">
          JPEG
        </option><option value="image/webp">
          WebP
        </option>
      </select><label class="flex items-center gap-2 text-sm">质量 <input v-model.number="quality" type="range" min="0.1" max="1" step="0.05"></label><Button size="sm" :disabled="!sourceUrl" @click="convert">
        转换
      </Button><Button size="sm" variant="outline" :disabled="!outputUrl" @click="download">
        下载
      </Button>
    </div>
    <div v-if="sourceUrl" class="mb-3 text-sm text-muted-foreground">
      {{ width }} × {{ height }} · 原始 {{ (sourceSize / 1024).toFixed(1) }} KB<span v-if="outputSize"> · 输出 {{ (outputSize / 1024).toFixed(1) }} KB</span>
    </div>
    <div class="grid gap-3 md:grid-cols-2">
      <div class="flex min-h-64 items-center justify-center rounded-md border border-border bg-muted/30">
        <img v-if="sourceUrl" :src="sourceUrl" class="max-h-80 max-w-full object-contain">
      </div><div class="flex min-h-64 items-center justify-center rounded-md border border-border bg-muted/30">
        <img v-if="outputUrl" :src="outputUrl" class="max-h-80 max-w-full object-contain">
      </div>
    </div>
  </ToolShell>
</template>
