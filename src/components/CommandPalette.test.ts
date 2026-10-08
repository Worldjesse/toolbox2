import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import CommandPalette from './CommandPalette.vue'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

const i18n = createI18n({
  legacy: false,
  locale: 'zh',
  messages: {
    zh: {
      command: {
        title: '查找工具',
        placeholder: '搜索工具...',
        empty: '没有匹配的工具',
        close: '关闭',
      },
      categories: {},
      tools: {},
    },
  },
  missingWarn: false,
})

function mountPalette() {
  return mount(CommandPalette, {
    props: { open: true },
    global: {
      plugins: [i18n],
      stubs: { Teleport: true },
    },
  })
}

describe('command palette dismissal', () => {
  it('stays open on overlay click and Escape', async () => {
    const wrapper = mountPalette()
    const overlay = wrapper.get('[data-testid="command-palette-overlay"]')

    await overlay.trigger('mousedown')
    await wrapper.get('input').trigger('keydown', { key: 'Escape' })

    expect(wrapper.emitted('update:open')).toBeUndefined()
  })

  it('closes only through the explicit close button', async () => {
    const wrapper = mountPalette()

    await wrapper.get('button[aria-label="关闭"]').trigger('click')

    expect(wrapper.emitted('update:open')).toEqual([[false]])
  })
})
