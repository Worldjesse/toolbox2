<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import ipaddr from 'ipaddr.js'
import { ref } from 'vue'
import ToolShell from '@/components/ToolShell.vue'
import { Button } from '@/components/ui/button'

interface TcpResult { ok: boolean, address: string, durationMs: number, error?: string }
const host = ref('github.com')
const port = ref(443)
const dnsResults = ref<string[]>([])
const tcpResult = ref<TcpResult>()
const cidr = ref('192.168.1.0/24')
const cidrResult = ref('')
const error = ref('')

async function lookupDns() {
  error.value = ''
  try {
    dnsResults.value = await invoke<string[]>('dns_lookup', { host: host.value })
  }
  catch (e) {
    error.value = String(e)
  }
}

async function probeTcp() {
  error.value = ''
  try {
    tcpResult.value = await invoke<TcpResult>('tcp_probe', { host: host.value, port: port.value, timeoutMs: 5000 })
  }
  catch (e) {
    error.value = String(e)
  }
}

function inspectCidr() {
  error.value = ''
  try {
    const [address, prefix] = ipaddr.parseCIDR(cidr.value)
    const details: Record<string, unknown> = { kind: address.kind(), normalized: address.toNormalizedString(), prefix }
    if (address.kind() === 'ipv4') {
      const bytes = address.toByteArray()
      const value = ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 0
      const mask = prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0
      const network = value & mask
      const broadcast = (network | (~mask >>> 0)) >>> 0
      const toIp = (number: number) => [24, 16, 8, 0].map(shift => (number >>> shift) & 255).join('.')
      details.network = toIp(network)
      details.broadcast = toIp(broadcast)
      details.firstHost = toIp(prefix >= 31 ? network : network + 1)
      details.lastHost = toIp(prefix >= 31 ? broadcast : broadcast - 1)
      details.addressCount = 2 ** (32 - prefix)
    }
    cidrResult.value = JSON.stringify(details, null, 2)
  }
  catch (e) {
    cidrResult.value = ''
    error.value = (e as Error).message
  }
}
</script>

<template>
  <ToolShell title="网络诊断" desc="DNS 查询、TCP 连通性与 IP/CIDR 计算">
    <div class="grid gap-6 lg:grid-cols-2">
      <section class="space-y-3">
        <h3 class="text-sm font-semibold">
          DNS / TCP
        </h3>
        <div class="flex gap-2">
          <input v-model="host" class="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 font-mono text-sm" placeholder="主机名"><input v-model.number="port" type="number" class="h-9 w-24 rounded-md border border-input bg-background px-3 font-mono text-sm">
        </div>
        <div class="flex gap-2">
          <Button size="sm" @click="lookupDns">
            DNS 查询
          </Button><Button size="sm" variant="outline" @click="probeTcp">
            测试端口
          </Button>
        </div>
        <div class="rounded-md border border-border bg-muted/30 p-3 font-mono text-sm">
          <div v-for="address in dnsResults" :key="address">
            {{ address }}
          </div><div v-if="tcpResult" class="mt-2" :class="tcpResult.ok ? 'text-emerald-600' : 'text-destructive'">
            {{ tcpResult.address }} · {{ tcpResult.ok ? '可连接' : tcpResult.error }} · {{ tcpResult.durationMs }} ms
          </div><span v-if="!dnsResults.length && !tcpResult" class="text-muted-foreground">—</span>
        </div>
      </section>
      <section class="space-y-3">
        <h3 class="text-sm font-semibold">
          IP / CIDR
        </h3>
        <div class="flex gap-2">
          <input v-model="cidr" class="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 font-mono text-sm"><Button size="sm" @click="inspectCidr">
            计算
          </Button>
        </div>
        <pre class="min-h-48 rounded-md border border-border bg-muted/30 p-3 font-mono text-sm">{{ cidrResult || '—' }}</pre>
      </section>
    </div>
    <p v-if="error" class="mt-3 text-sm text-destructive">
      {{ error }}
    </p>
  </ToolShell>
</template>
