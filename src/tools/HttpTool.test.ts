import { invoke } from '@tauri-apps/api/core'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HttpTool from './HttpTool.vue'

const { getSetting, saveFile, setSetting, writeTextFile } = vi.hoisted(() => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
  saveFile: vi.fn(),
  writeTextFile: vi.fn(),
}))

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => ({ getSetting, setSetting }),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: saveFile,
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  writeTextFile,
}))

function mountTool() {
  return mount(HttpTool, {
    global: {
      stubs: {
        ToolShell: {
          props: ['title', 'desc'],
          template: '<div><slot /></div>',
        },
      },
    },
  })
}

function buttonByText(wrapper: ReturnType<typeof mountTool>, text: string) {
  const button = wrapper.findAll('button').find(item => item.text().trim() === text)
  if (!button)
    throw new Error(`Button not found: ${text}`)
  return button
}

function buttonContainingText(wrapper: ReturnType<typeof mountTool>, text: string) {
  const button = wrapper.findAll('button').find(item => item.text().includes(text))
  if (!button)
    throw new Error(`Button containing text not found: ${text}`)
  return button
}

describe('http tool save dialog', () => {
  beforeEach(() => {
    getSetting.mockReset().mockResolvedValue(undefined)
    setSetting.mockReset().mockResolvedValue(undefined)
    vi.mocked(invoke).mockReset()
    saveFile.mockReset()
    writeTextFile.mockReset()
  })

  it('cancels without creating a default group', async () => {
    const wrapper = mountTool()
    await flushPromises()

    await buttonByText(wrapper, '另存为').trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('0 个分组 · 0 个接口')

    await wrapper.find('[role="dialog"]').findAll('button').find(item => item.text().trim() === '取消')!.trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('0 个分组 · 0 个接口')
  })

  it('keeps create and save dialogs open when the overlay or Escape is used', async () => {
    const wrapper = mountTool()
    await flushPromises()

    await buttonByText(wrapper, '另存为').trigger('click')
    const saveOverlay = wrapper.get('[data-testid="save-dialog-overlay"]')
    await saveOverlay.trigger('click')
    await saveOverlay.trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[data-testid="save-dialog-overlay"]').exists()).toBe(true)
    await wrapper.get('[data-testid="save-dialog-overlay"] button[title="关闭"]').trigger('click')
    expect(wrapper.find('[data-testid="save-dialog-overlay"]').exists()).toBe(false)

    await wrapper.get('button[title="新建分组"]').trigger('click')
    const groupOverlay = wrapper.get('[data-testid="group-dialog-overlay"]')
    await groupOverlay.trigger('click')
    await groupOverlay.trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[data-testid="group-dialog-overlay"]').exists()).toBe(true)
    await groupOverlay.findAll('button').find(item => item.text().trim() === '取消')!.trigger('click')
    expect(wrapper.find('[data-testid="group-dialog-overlay"]').exists()).toBe(false)
  })

  it('keeps delete confirmation open when the overlay or Escape is used', async () => {
    getSetting.mockResolvedValue({
      version: 1,
      groups: [{ id: 'group-1', name: 'OMS', createdAt: 1 }],
      requests: [{
        id: 'request-1',
        groupId: 'group-1',
        name: '待删除接口',
        method: 'GET',
        url: 'https://example.com/request',
        timeoutMs: 30000,
        query: [],
        headers: [],
        bodyType: 'none',
        body: '',
        updatedAt: 1,
      }],
    })
    const wrapper = mountTool()
    await flushPromises()

    await wrapper.get('button[title="删除接口"]').trigger('click')
    const deleteOverlay = wrapper.get('[data-testid="delete-dialog-overlay"]')
    await deleteOverlay.trigger('click')
    await deleteOverlay.trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(true)
    await deleteOverlay.findAll('button').find(item => item.text().trim() === '取消')!.trigger('click')
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
  })

  it('saves reactive request data as a new record and closes the dialog', async () => {
    const wrapper = mountTool()
    await flushPromises()

    await buttonByText(wrapper, '另存为').trigger('click')
    const dialog = wrapper.find('[role="dialog"]')
    await dialog.findAll('button').find(item => item.text().trim() === '另存为')!.trigger('click')
    await flushPromises()

    expect(setSetting).toHaveBeenCalledOnce()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('1 个分组 · 1 个接口')
  })

  it('keeps the loaded request unchanged when saving the edited configuration as new', async () => {
    getSetting.mockResolvedValue({
      version: 1,
      groups: [{ id: 'group-1', name: 'OMS', createdAt: 1 }],
      requests: [{
        id: 'request-1',
        groupId: 'group-1',
        name: '旧接口',
        method: 'POST',
        url: 'https://example.com/old',
        timeoutMs: 30000,
        query: [],
        headers: [{ key: 'Authorization', value: 'Bearer token', enabled: true }],
        bodyType: 'json',
        body: '{"page":1}',
        updatedAt: 1,
      }],
    })
    const wrapper = mountTool()
    await flushPromises()

    await buttonContainingText(wrapper, '旧接口').trigger('click')
    await wrapper.find('input[placeholder="https://api.example.com/v1/..."]').setValue('https://example.com/new')
    await buttonByText(wrapper, '另存为').trigger('click')
    const dialog = wrapper.find('[role="dialog"]')
    await dialog.find('input[placeholder="例如：查询店铺权限"]').setValue('新接口')
    await dialog.findAll('button').find(item => item.text().trim() === '另存为')!.trigger('click')
    await flushPromises()

    const savedState = setSetting.mock.calls[0][1]
    expect(savedState.requests).toHaveLength(2)
    expect(savedState.requests.find((item: { id: string }) => item.id === 'request-1')).toMatchObject({
      name: '旧接口',
      url: 'https://example.com/old',
      headers: [{ key: 'Authorization', value: 'Bearer token', enabled: true }],
      body: '{"page":1}',
    })
    expect(savedState.requests.find((item: { name: string }) => item.name === '新接口')).toMatchObject({
      url: 'https://example.com/new',
      headers: [{ key: 'Authorization', value: 'Bearer token', enabled: true }],
      body: '{"page":1}',
    })
  })

  it('updates the loaded request without creating another record', async () => {
    getSetting.mockResolvedValue({
      version: 1,
      groups: [{ id: 'group-1', name: 'OMS', createdAt: 1 }],
      requests: [{
        id: 'request-1',
        groupId: 'group-1',
        name: '原接口',
        method: 'POST',
        url: 'https://example.com/old',
        timeoutMs: 30000,
        query: [],
        headers: [],
        bodyType: 'none',
        body: '',
        updatedAt: 1,
      }],
    })
    const wrapper = mountTool()
    await flushPromises()

    await buttonContainingText(wrapper, '原接口').trigger('click')
    await wrapper.find('input[placeholder="https://api.example.com/v1/..."]').setValue('https://example.com/updated')
    await buttonByText(wrapper, '更新').trigger('click')
    const dialog = wrapper.find('[role="dialog"]')
    await dialog.findAll('button').find(item => item.text().trim() === '更新')!.trigger('click')
    await flushPromises()

    const savedState = setSetting.mock.calls[0][1]
    expect(savedState.requests).toHaveLength(1)
    expect(savedState.requests[0]).toMatchObject({ id: 'request-1', url: 'https://example.com/updated' })
  })

  it('clears the editor only through the dedicated clear action', async () => {
    getSetting.mockResolvedValue({
      version: 1,
      groups: [{ id: 'group-1', name: 'OMS', createdAt: 1 }],
      requests: [{
        id: 'request-1',
        groupId: 'group-1',
        name: '带配置接口',
        method: 'POST',
        url: 'https://example.com/request',
        timeoutMs: 30000,
        query: [],
        headers: [{ key: 'Authorization', value: 'Bearer token', enabled: true }],
        bodyType: 'json',
        body: '{"page":1}',
        updatedAt: 1,
      }],
    })
    const wrapper = mountTool()
    await flushPromises()

    await buttonContainingText(wrapper, '带配置接口').trigger('click')
    const urlInput = wrapper.find('input[placeholder="https://api.example.com/v1/..."]')
    expect((urlInput.element as HTMLInputElement).value).toBe('https://example.com/request')

    await wrapper.find('button[title="清空请求编辑区"]').trigger('click')

    expect((urlInput.element as HTMLInputElement).value).toBe('')
    expect(buttonByText(wrapper, '更新').attributes('disabled')).toBeDefined()
  })
})

describe('http tool response viewer', () => {
  beforeEach(() => {
    getSetting.mockReset().mockResolvedValue(undefined)
    setSetting.mockReset().mockResolvedValue(undefined)
    vi.mocked(invoke).mockReset()
    saveFile.mockReset()
    writeTextFile.mockReset()
  })

  it('allows response content to be selected with the mouse', async () => {
    const wrapper = mountTool()
    await flushPromises()

    const responseContent = wrapper.get('[data-testid="http-response-content"]')
    expect(responseContent.classes()).toContain('response-selectable')
    expect(buttonByText(wrapper, '复制选中').attributes('disabled')).toBeDefined()
    expect(buttonByText(wrapper, '复制全部').attributes('disabled')).toBeDefined()
  })

  it('limits the rendered preview for large responses', async () => {
    vi.mocked(invoke).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: [],
      body: 'x'.repeat(250_000),
      durationMs: 10,
      sizeBytes: 250_000,
      truncated: false,
      finalUrl: 'https://httpbin.org/get',
      error: null,
    })
    const wrapper = mountTool()
    await flushPromises()

    await buttonByText(wrapper, 'Send').trigger('click')
    await flushPromises()

    const responseContent = wrapper.get('[data-testid="http-response-content"]')
    expect(responseContent.text()).toContain('仅显示前 200,000 个字符')
    expect(responseContent.text()).toContain('避免长时间占用过多内存')
    expect(responseContent.text()).not.toContain('x'.repeat(200_001))
  })

  it('keeps only the five most recent requests in a fixed-height scroll area', async () => {
    vi.mocked(invoke).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: [],
      body: '{}',
      durationMs: 10,
      sizeBytes: 2,
      truncated: false,
      finalUrl: 'https://example.com',
      error: null,
    })
    const wrapper = mountTool()
    await flushPromises()
    const urlInput = wrapper.get('input[placeholder="https://api.example.com/v1/..."]')

    for (let index = 0; index < 6; index++) {
      await urlInput.setValue(`https://example.com/request-${index}`)
      await buttonByText(wrapper, 'Send').trigger('click')
      await flushPromises()
    }

    const history = wrapper.get('[data-testid="recent-requests"]')
    expect(history.classes()).toContain('h-[230px]')
    expect(history.findAll('[data-testid="recent-request"]')).toHaveLength(5)
    expect(history.text()).toContain('request-5')
    expect(history.text()).not.toContain('request-0')
  })

  it('exports a redacted Markdown context through the save dialog', async () => {
    getSetting.mockImplementation(async (key: string) => key === 'http.collections'
      ? {
          version: 1,
          groups: [{ id: 'group-1', name: 'OMS', createdAt: 1 }],
          requests: [{
            id: 'request-1',
            groupId: 'group-1',
            name: '店铺权限接口',
            method: 'POST',
            url: 'https://example.com/select-list-by-store-status',
            timeoutMs: 30000,
            query: [{ key: 'status', value: 'OFF_USE', enabled: true }],
            headers: [
              { key: 'Authorization', value: 'Bearer real-login-token', enabled: true },
              { key: 'user-name', value: '000602', enabled: true },
            ],
            bodyType: 'json',
            body: '{"storeStatus":"OFF_USE","password":"request-secret"}',
            updatedAt: 1,
          }],
        }
      : undefined)
    vi.mocked(invoke).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: [{ key: 'Set-Cookie', value: 'secret', enabled: true }],
      body: '{"token":"response-secret","data":{"storeIds":[8851]}}',
      durationMs: 10,
      sizeBytes: 58,
      truncated: false,
      finalUrl: 'https://example.com/select-list-by-store-status?status=OFF_USE',
      error: null,
    })
    saveFile.mockResolvedValue('D:\\exports\\http-context.md')
    writeTextFile.mockResolvedValue(undefined)
    const wrapper = mountTool()
    await flushPromises()

    await buttonContainingText(wrapper, '店铺权限接口').trigger('click')
    await buttonByText(wrapper, 'Send').trigger('click')
    await flushPromises()
    await buttonByText(wrapper, '导出 AI 上下文').trigger('click')
    await flushPromises()

    const exportOverlay = wrapper.get('[data-testid="export-dialog-overlay"]')
    await exportOverlay.trigger('click')
    await exportOverlay.trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[data-testid="export-dialog-overlay"]').exists()).toBe(true)

    await exportOverlay.get('input[type="date"]').setValue('2026-10-07')
    await exportOverlay.get('input[placeholder^="例如：9dfbf"]').setValue('9dfbf453c2e03a12486234303b2a6804d3f059d2')
    await exportOverlay.get('textarea').setValue('OFF_USE 响应，证明包含 8851、不包含 44。')
    await exportOverlay.findAll('button').find(item => item.text().trim() === '导出 Markdown')!.trigger('click')
    await flushPromises()

    expect(saveFile).toHaveBeenCalledOnce()
    expect(writeTextFile).toHaveBeenCalledOnce()
    expect(writeTextFile.mock.calls[0][0]).toBe('D:\\exports\\http-context.md')
    const markdown = writeTextFile.mock.calls[0][1]
    expect(markdown).toContain('# HTTP Integration Evidence')
    expect(markdown).toContain('- Test date: 2026-10-07')
    expect(markdown).toContain('- Deployment environment: project3')
    expect(markdown).toContain('- Service / repository: api-oms')
    expect(markdown).toContain('- Deployment commit: 9dfbf453c2e03a12486234303b2a6804d3f059d2')
    expect(markdown).toContain('- Method: POST')
    expect(markdown).toContain('- Request URL: https://example.com/select-list-by-store-status?status=OFF_USE')
    expect(markdown).toContain('"key": "user-name"')
    expect(markdown).toContain('"value": "000602"')
    expect(markdown).toContain('Real login token was used; the token value is intentionally omitted.')
    expect(markdown).toContain('"storeStatus": "OFF_USE"')
    expect(markdown).toContain('- Status: 200 OK')
    expect(markdown).toContain('"storeIds": [')
    expect(markdown).toContain('8851')
    expect(markdown).toContain('OFF_USE 响应，证明包含 8851、不包含 44。')
    expect(markdown).not.toContain('real-login-token')
    expect(markdown).not.toContain('request-secret')
    expect(markdown).not.toContain('response-secret')
    expect(setSetting).toHaveBeenCalledWith('http.aiExportMetadata', {
      environment: 'project3',
      service: 'api-oms',
      commitId: '9dfbf453c2e03a12486234303b2a6804d3f059d2',
    })
    expect(wrapper.find('[data-testid="export-dialog-overlay"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('AI 上下文已导出')
  })
})
