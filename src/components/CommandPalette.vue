<script setup lang="ts">
import { Search, X } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import ToolIcon from '@/components/ToolIcon.vue'
import { toolRegistry } from '@/tools/registry'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const { t } = useI18n()
const router = useRouter()
const query = ref('')
const activeIndex = ref(0)
const input = ref<HTMLInputElement>()

const matches = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  if (!needle)
    return toolRegistry
  return toolRegistry.filter((tool) => {
    const haystack = [t(tool.titleKey), t(tool.descKey), t(`categories.${tool.category}`), ...tool.keywords]
      .join(' ')
      .toLocaleLowerCase()
    return haystack.includes(needle)
  })
})

watch(() => props.open, async (open) => {
  if (!open)
    return
  query.value = ''
  activeIndex.value = 0
  await nextTick()
  input.value?.focus()
})

watch(matches, () => {
  activeIndex.value = 0
})

function close() {
  emit('update:open', false)
}

async function openTool(path: string) {
  close()
  await router.push(path)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeIndex.value = Math.min(activeIndex.value + 1, matches.value.length - 1)
  }
  else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, 0)
  }
  else if (event.key === 'Enter') {
    const tool = matches.value[activeIndex.value]
    if (tool)
      void openTool(tool.path)
  }
}

function onGlobalKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'k') {
    event.preventDefault()
    if (!props.open)
      emit('update:open', true)
  }
}

onMounted(() => window.addEventListener('keydown', onGlobalKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[12vh] backdrop-blur-sm"
      role="presentation"
      data-testid="command-palette-overlay"
    >
      <section
        class="w-full max-w-xl overflow-hidden rounded-lg border border-border bg-popover shadow-2xl"
        role="dialog"
        aria-modal="true"
        :aria-label="t('command.title')"
      >
        <div class="flex items-center gap-3 border-b border-border bg-secondary/40 px-4">
          <Search class="size-5 text-primary" />
          <input
            ref="input"
            v-model="query"
            class="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none ring-0 focus:border-transparent focus:ring-0"
            :placeholder="t('command.placeholder')"
            @keydown="onKeydown"
          >
          <button
            type="button"
            class="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            :title="t('command.close')"
            :aria-label="t('command.close')"
            @click="close"
          >
            <X class="size-4" />
          </button>
        </div>
        <div class="max-h-[55vh] overflow-auto p-2">
          <button
            v-for="(tool, index) in matches"
            :key="tool.id"
            type="button"
            class="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors"
            :class="index === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'"
            @mouseenter="activeIndex = index"
            @click="openTool(tool.path)"
          >
            <ToolIcon :name="tool.icon" class="size-5 shrink-0" />
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-medium">{{ t(tool.titleKey) }}</span>
              <span class="block truncate text-xs text-muted-foreground">{{ t(tool.descKey) }}</span>
            </span>
            <span class="text-xs text-muted-foreground">{{ t(`categories.${tool.category}`) }}</span>
          </button>
          <p v-if="matches.length === 0" class="px-3 py-8 text-center text-sm text-muted-foreground">
            {{ t('command.empty') }}
          </p>
        </div>
      </section>
    </div>
  </Teleport>
</template>
