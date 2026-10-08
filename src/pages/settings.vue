<script setup lang="ts">
import type { Language } from '@/lib/config'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ThemeSwitch from '@/components/ThemeSwitch.vue'
import { Button } from '@/components/ui/button'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getLanguageLabel, supportedLanguages } from '@/lib/config'
import { useSettingsStore } from '@/stores/settings'

const { t, locale } = useI18n()
const availableLanguages = ref<Language[]>(supportedLanguages())
const settingsStore = useSettingsStore()

watch(locale, (newLocale, oldLocale) => {
  if (newLocale && newLocale !== oldLocale)
    handleLanguageSelect(newLocale)
}, { immediate: true })

function handleLanguageSelect(newLocale: string) {
  if (!newLocale || !availableLanguages.value.some(sl => sl.value === newLocale))
    return
  settingsStore.setSetting<string>('language', newLocale)
}

async function clearDrafts() {
  await settingsStore.removeSettingsByPrefix('draft.')
}
</script>

<template>
  <div class="mx-auto max-w-4xl overflow-hidden rounded-lg border border-border bg-card shadow-[0_1px_2px_oklch(0.2_0.03_190/0.04),0_14px_40px_oklch(0.2_0.03_190/0.05)]">
    <div class="space-y-1 border-b border-border bg-secondary/45 px-6 py-5">
      <h2 class="text-xl font-bold">
        {{ t('settings.label') }}
      </h2>
      <p class="text-sm text-muted-foreground">
        {{ t('settings.description') }}
      </p>
    </div>
    <div class="divide-y divide-border px-6">
      <div class="flex min-h-20 items-center justify-between gap-4 py-5">
        <Label class="font-medium" for="theme-switch">{{ t('settings.theme.label') }}</Label>
        <ThemeSwitch />
      </div>
      <div class="flex min-h-20 items-center justify-between gap-4 py-5">
        <Label class="font-medium" for="language-select">{{ t('languages.label') }}</Label>
        <Select id="language-select" v-model="locale">
          <SelectTrigger class="w-48">
            <SelectValue :placeholder="getLanguageLabel(locale)" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem
                v-for="availableLanguage in availableLanguages"
                :key="availableLanguage.value"
                :value="availableLanguage.value"
              >
                {{ availableLanguage.label }}
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div class="flex min-h-24 items-center justify-between gap-4 py-5">
        <div>
          <div class="font-medium">
            {{ t('settings.drafts.label') }}
          </div>
          <div class="text-sm text-muted-foreground">
            {{ t('settings.drafts.description') }}
          </div>
        </div>
        <Button variant="outline" @click="clearDrafts">
          {{ t('settings.drafts.clear') }}
        </Button>
      </div>
    </div>
  </div>
</template>
