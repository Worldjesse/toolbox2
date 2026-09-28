<script setup lang="ts">
import jsQR from 'jsqr'
import QRCode from 'qrcode'
import { ref } from 'vue'
import ToolShell from '@/components/ToolShell.vue'
import { Button } from '@/components/ui/button'

const input = ref('https://github.com/Worldjesse/toolbox2')
const generated = ref('')
const decoded = ref('')
const error = ref('')

async function generate() {
  error.value = ''
  try {
    generated.value = await QRCode.toDataURL(input.value, { width: 512, margin: 2, errorCorrectionLevel: 'M' })
  }
  catch (e) {
    error.value = (e as Error).message
  }
}

function scan(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file)
    return
  const image = new Image()
  image.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    if (!context)
      return
    context.drawImage(image, 0, 0)
    const data = context.getImageData(0, 0, canvas.width, canvas.height)
    decoded.value = jsQR(data.data, data.width, data.height)?.data ?? '未识别到二维码'
  }
  image.src = URL.createObjectURL(file)
}
</script>

<template>
  <ToolShell title="二维码" desc="生成二维码或从本地图片识别内容">
    <div class="grid gap-6 md:grid-cols-2">
      <section class="space-y-3">
        <h3 class="text-sm font-semibold">
          生成
        </h3><textarea v-model="input" class="min-h-28 w-full rounded-md border border-input bg-background p-3 text-sm" /><Button size="sm" @click="generate">
          生成二维码
        </Button><div class="flex min-h-64 items-center justify-center rounded-md border border-border bg-muted/30">
          <img v-if="generated" :src="generated" class="size-60">
        </div>
      </section>
      <section class="space-y-3">
        <h3 class="text-sm font-semibold">
          识别
        </h3><input type="file" accept="image/*" class="block w-full text-sm" @change="scan"><textarea :value="decoded" readonly class="min-h-64 w-full rounded-md border border-input bg-muted/30 p-3 text-sm" placeholder="识别结果..." />
      </section>
    </div>
    <p v-if="error" class="mt-3 text-sm text-destructive">
      {{ error }}
    </p>
  </ToolShell>
</template>
