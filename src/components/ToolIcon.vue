<script setup lang="ts">
import type { Component } from 'vue'
import {
  ArrowLeftRight,
  Binary,
  Braces,
  CalendarDays,
  Clipboard,
  Clock3,
  Database,
  Files,
  FileText,
  FingerprintPattern,
  Hash,
  Image,
  KeyRound,
  Link,
  Network,
  PlugZap,
  QrCode,
  Regex,
  Repeat2,
  TextCursorInput,
} from '@lucide/vue'

defineProps<{ name: string }>()

const icons: Record<string, Component> = {
  'ph:plugs-connected-duotone': PlugZap,
  'ph:network-duotone': Network,
  'ph:brackets-curly-duotone': Braces,
  'ph:key-duotone': KeyRound,
  'ph:link-duotone': Link,
  'ph:hash-duotone': Hash,
  'ph:asterisk-duotone': Regex,
  'ph:arrows-left-right-duotone': ArrowLeftRight,
  'ph:swap-duotone': Repeat2,
  'ph:calendar-dots-duotone': CalendarDays,
  'ph:database-duotone': Database,
  'ph:clock-duotone': Clock3,
  'ph:binary-duotone': Binary,
  'ph:fingerprint-duotone': FingerprintPattern,
  'ph:text-aa-duotone': TextCursorInput,
  'ph:file-duotone': FileText,
  'ph:files-duotone': Files,
  'ph:image-duotone': Image,
  'ph:qr-code-duotone': QrCode,
  'ph:clipboard-text-duotone': Clipboard,
}
</script>

<template>
  <component :is="icons[name] ?? FileText" aria-hidden="true" />
</template>
