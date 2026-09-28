<script setup lang="ts">
import { decodeJwt, decodeProtectedHeader, jwtVerify } from 'jose'
import { computed, ref } from 'vue'
import ToolShell from '@/components/ToolShell.vue'
import { Button } from '@/components/ui/button'

const token = ref('')
const secret = ref('')
const header = ref('')
const payload = ref('')
const verifyResult = ref('')
const error = ref('')

const expiry = computed(() => {
  if (!payload.value)
    return ''
  try {
    const exp = JSON.parse(payload.value).exp
    if (typeof exp !== 'number')
      return '未包含 exp'
    const date = new Date(exp * 1000)
    return `${date.toLocaleString('zh-CN', { hour12: false })} (${date.getTime() < Date.now() ? '已过期' : '有效'})`
  }
  catch {
    return ''
  }
})

function decode() {
  error.value = ''
  verifyResult.value = ''
  try {
    header.value = JSON.stringify(decodeProtectedHeader(token.value.trim()), null, 2)
    payload.value = JSON.stringify(decodeJwt(token.value.trim()), null, 2)
  }
  catch (e) {
    header.value = ''
    payload.value = ''
    error.value = (e as Error).message
  }
}

async function verify() {
  decode()
  if (error.value)
    return
  try {
    const decodedHeader = decodeProtectedHeader(token.value.trim())
    if (!decodedHeader.alg?.startsWith('HS'))
      throw new Error('当前仅支持 HS256 / HS384 / HS512 对称密钥验证')
    await jwtVerify(token.value.trim(), new TextEncoder().encode(secret.value), {
      algorithms: [decodedHeader.alg],
    })
    verifyResult.value = '签名有效'
  }
  catch (e) {
    verifyResult.value = `签名无效：${(e as Error).message}`
  }
}
</script>

<template>
  <ToolShell title="JWT 解码 / 验证" desc="本地解析声明并验证 HMAC 签名，令牌和密钥不会保存">
    <textarea v-model="token" class="min-h-28 w-full rounded-md border border-input bg-background p-3 font-mono text-sm" placeholder="粘贴 JWT..." />
    <div class="my-3 flex flex-wrap gap-2">
      <Button size="sm" @click="decode">
        解码
      </Button>
      <input v-model="secret" type="password" class="h-9 min-w-56 flex-1 rounded-md border border-input bg-background px-3 font-mono text-sm" placeholder="HMAC 密钥（仅验证时需要）">
      <Button size="sm" variant="outline" @click="verify">
        验证签名
      </Button>
    </div>
    <p v-if="expiry" class="mb-3 text-sm text-muted-foreground">
      过期时间：{{ expiry }}
    </p>
    <p v-if="verifyResult" class="mb-3 text-sm" :class="verifyResult === '签名有效' ? 'text-emerald-600' : 'text-destructive'">
      {{ verifyResult }}
    </p>
    <div class="grid gap-3 md:grid-cols-2">
      <div>
        <div class="mb-1 text-xs text-muted-foreground">
          Header
        </div><pre class="min-h-56 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs">{{ header || '—' }}</pre>
      </div>
      <div>
        <div class="mb-1 text-xs text-muted-foreground">
          Payload
        </div><pre class="min-h-56 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs">{{ payload || '—' }}</pre>
      </div>
    </div>
    <p v-if="error" class="mt-2 text-sm text-destructive">
      {{ error }}
    </p>
  </ToolShell>
</template>
