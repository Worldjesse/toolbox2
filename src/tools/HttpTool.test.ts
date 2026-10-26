import { invoke } from '@tauri-apps/api/core'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultHttpAuth } from './httpCollections'
import HttpTool from './HttpTool.vue'
import { emptyHttpRequestDraft, emptyHttpWorkspace } from './httpWorkspace'

const { getSetting, openFile, readTextFile, saveFile, setSetting, writeTextFile } = vi.hoisted(() => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
  openFile: vi.fn(),
  readTextFile: vi.fn(),
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
  open: openFile,
  save: saveFile,
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile,
  writeTextFile,
}))

enableAutoUnmount(afterEach)

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

function storedValue(key: string) {
  for (let index = setSetting.mock.calls.length - 1; index >= 0; index--) {
    const call = setSetting.mock.calls[index]
    if (call?.[0] === key)
      return call[1]
  }
  return undefined
}

describe('http tool save dialog', () => {
  beforeEach(() => {
    getSetting.mockReset().mockResolvedValue(undefined)
    setSetting.mockReset().mockResolvedValue(undefined)
    vi.mocked(invoke).mockReset()
    openFile.mockReset()
    readTextFile.mockReset()
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

    expect(storedValue('http.collections')).toBeDefined()
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

    const savedState = storedValue('http.collections')
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

    const savedState = storedValue('http.collections')
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

describe('http tool workspace', () => {
  beforeEach(() => {
    getSetting.mockReset().mockResolvedValue(undefined)
    setSetting.mockReset().mockResolvedValue(undefined)
    vi.mocked(invoke).mockReset()
    openFile.mockReset()
    readTextFile.mockReset()
    saveFile.mockReset()
    writeTextFile.mockReset()
  })

  it('resolves environment variables and Bearer auth before invoking Rust', async () => {
    const workspace = emptyHttpWorkspace()
    workspace.environments[0].variables = [
      { key: 'baseUrl', value: 'https://api.example.com', enabled: true },
      { key: 'token', value: 'local-secret', enabled: true },
    ]
    const draft = emptyHttpRequestDraft()
    draft.url = '{{baseUrl}}/users'
    draft.auth = { ...defaultHttpAuth(), type: 'bearer', token: '{{token}}' }
    workspace.tabs[0].request = draft
    getSetting.mockImplementation(async (key: string) => key === 'http.workspace' ? workspace : undefined)
    vi.mocked(invoke).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: [],
      body: '{}',
      durationMs: 9,
      sizeBytes: 2,
      truncated: false,
      finalUrl: 'https://api.example.com/users',
      error: null,
    })
    const wrapper = mountTool()
    await flushPromises()

    await buttonByText(wrapper, 'Send').trigger('click')
    await flushPromises()

    expect(invoke).toHaveBeenCalledWith('http_request', {
      input: expect.objectContaining({
        url: 'https://api.example.com/users',
        headers: expect.arrayContaining([
          expect.objectContaining({ key: 'Authorization', value: 'Bearer local-secret', enabled: true }),
        ]),
      }),
    })
  })

  it('resolves request, environment and global variables in precedence order', async () => {
    const workspace = emptyHttpWorkspace()
    workspace.globalVariables = [
      { key: 'baseUrl', value: 'https://global.example.com', enabled: true },
      { key: 'resource', value: 'global', enabled: true },
    ]
    workspace.environments[0].variables = [
      { key: 'baseUrl', value: 'https://environment.example.com', enabled: true },
      { key: 'resource', value: 'environment', enabled: true },
    ]
    const draft = emptyHttpRequestDraft()
    draft.url = '{{baseUrl}}/{{resource}}'
    draft.variables = [{ key: 'resource', value: 'request', enabled: true }]
    workspace.tabs[0].request = draft
    getSetting.mockImplementation(async (key: string) => key === 'http.workspace' ? workspace : undefined)
    vi.mocked(invoke).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: [],
      body: '{}',
      durationMs: 9,
      sizeBytes: 2,
      truncated: false,
      finalUrl: 'https://environment.example.com/request',
      error: null,
    })
    const wrapper = mountTool()
    await flushPromises()

    await buttonByText(wrapper, 'Send').trigger('click')
    await flushPromises()

    expect(invoke).toHaveBeenCalledWith('http_request', {
      input: expect.objectContaining({ url: 'https://environment.example.com/request' }),
    })
  })

  it('imports a Postman collection into local groups without dismissing on the overlay', async () => {
    const wrapper = mountTool()
    await flushPromises()

    await buttonByText(wrapper, '导入').trigger('click')
    const overlay = wrapper.get('[data-testid="interchange-dialog-overlay"]')
    await overlay.trigger('click')
    await overlay.trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[data-testid="interchange-dialog-overlay"]').exists()).toBe(true)

    await overlay.get('select').setValue('postman')
    await overlay.get('[data-testid="interchange-input"]').setValue(JSON.stringify({
      info: { name: 'Imported API' },
      item: [{
        name: 'Health',
        request: { method: 'GET', url: 'https://api.example.com/health', header: [] },
      }],
    }))
    await buttonByText(wrapper, '导入到本地集合').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="interchange-dialog-overlay"]').exists()).toBe(false)
    expect(storedValue('http.collections')).toMatchObject({
      version: 3,
      groups: [{ name: 'Imported API' }],
      requests: [{ name: 'Health', url: 'https://api.example.com/health' }],
    })
  })

  it('keeps independent request drafts in multiple tabs', async () => {
    const wrapper = mountTool()
    await flushPromises()
    const firstUrl = wrapper.get('input[placeholder="https://api.example.com/v1/..."]')
    await firstUrl.setValue('https://example.com/first')

    await wrapper.get('button[title="新建请求标签"]').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-testid="http-request-tab"]')).toHaveLength(2)
    await wrapper.get('input[placeholder="https://api.example.com/v1/..."]').setValue('https://example.com/second')

    await wrapper.findAll('[data-testid="http-request-tab"]')[0].trigger('click')
    await flushPromises()
    expect((wrapper.get('input[placeholder="https://api.example.com/v1/..."]').element as HTMLInputElement).value).toBe('https://example.com/first')
  })

  it('opens variable management without rewriting a literal URL', async () => {
    const workspace = emptyHttpWorkspace()
    workspace.environments[0].variables = [
      { key: 'baseUrl', value: 'https://api.example.com', enabled: true },
    ]
    workspace.tabs[0].request.url = 'https://api.example.com/oms/users'
    getSetting.mockImplementation(async (key: string) => key === 'http.workspace' ? workspace : undefined)
    const wrapper = mountTool()
    await flushPromises()

    await wrapper.get('button[title="编辑变量"]').trigger('click')

    expect(wrapper.find('[data-testid="environment-dialog-overlay"]').exists()).toBe(true)
    expect((wrapper.get('[data-testid="http-url-input"]').element as HTMLInputElement).value).toBe('https://api.example.com/oms/users')
  })

  it('shows the resolved baseUrl while retaining the variable-backed request URL', async () => {
    const workspace = emptyHttpWorkspace()
    workspace.environments[0].variables = [
      { key: 'baseUrl', value: 'https://api.example.com', enabled: true },
    ]
    workspace.tabs[0].request.url = '{{baseUrl}}/oms/users'
    getSetting.mockImplementation(async (key: string) => key === 'http.workspace' ? workspace : undefined)
    const wrapper = mountTool()
    await flushPromises()

    expect(wrapper.get('[data-testid="http-url-base-prefix"]').text()).toBe('https://api.example.com')
    expect((wrapper.get('[data-testid="http-url-input"]').element as HTMLInputElement).value).toBe('/oms/users')

    await wrapper.get('button[title="编辑变量"]').trigger('click')
    const dialog = wrapper.get('[data-testid="environment-dialog-overlay"]')
    const baseUrlValueInput = dialog.findAll('input[placeholder="变量值"]').find(item => (
      (item.element as HTMLInputElement).value === 'https://api.example.com'
    ))!
    await baseUrlValueInput.setValue('https://new-api.example.com')
    await buttonByText(wrapper, '完成').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="http-url-base-prefix"]').text()).toBe('https://new-api.example.com')
    expect(storedValue('http.workspace').environments[0].variables[0].value).toBe('https://new-api.example.com')
  })

  it('resolves any manually entered leading URL variable', async () => {
    const workspace = emptyHttpWorkspace()
    workspace.environments[0].variables = [
      { key: 'erpUrl', value: 'http://project3-api-erp.dearlovertech.com', enabled: true },
      { key: 'erpGateway', value: 'http://project3-api-erp-gateway.dearlovertech.com', enabled: true },
    ]
    workspace.tabs[0].request.url = ''
    getSetting.mockImplementation(async (key: string) => key === 'http.workspace' ? workspace : undefined)
    const wrapper = mountTool()
    await flushPromises()

    await wrapper.get('[data-testid="http-url-input"]').setValue('{{erpUrl}}/user/user-info/location')
    await flushPromises()

    expect(wrapper.get('[data-testid="http-url-base-prefix"]').text()).toBe('http://project3-api-erp.dearlovertech.com')
    expect(wrapper.get('[data-testid="http-url-base-prefix"]').attributes('title')).toContain('erpUrl')
    expect((wrapper.get('[data-testid="http-url-input"]').element as HTMLInputElement).value).toBe('/user/user-info/location')
  })

  it('keeps the raw URL editable when one variable name prefixes another', async () => {
    const workspace = emptyHttpWorkspace()
    workspace.environments[0].variables = [
      { key: 'erp', value: 'http://project3-api-erp.dearlovertech.com', enabled: true },
      { key: 'erpGateWay', value: 'http://project3-api-erp-gateway.dearlovertech.com', enabled: true },
    ]
    workspace.tabs[0].request.url = ''
    getSetting.mockImplementation(async (key: string) => key === 'http.workspace' ? workspace : undefined)
    const wrapper = mountTool()
    await flushPromises()

    const urlInput = wrapper.get('[data-testid="http-url-input"]')
    await urlInput.trigger('focus')
    await urlInput.setValue('{{erp}}')
    await flushPromises()

    expect(wrapper.find('[data-testid="http-url-base-prefix"]').exists()).toBe(false)
    expect((wrapper.get('[data-testid="http-url-input"]').element as HTMLInputElement).value).toBe('{{erp}}')

    await wrapper.get('[data-testid="http-url-input"]').setValue('{{erpGateWay}}/product/model')
    await wrapper.get('[data-testid="http-url-input"]').trigger('blur')
    await flushPromises()

    expect(wrapper.get('[data-testid="http-url-base-prefix"]').text()).toBe('http://project3-api-erp-gateway.dearlovertech.com')
    expect(wrapper.get('[data-testid="http-url-base-prefix"]').attributes('title')).toContain('erpGateWay')
    expect((wrapper.get('[data-testid="http-url-input"]').element as HTMLInputElement).value).toBe('/product/model')
  })

  it('opens collection requests in tabs and reuses an already open tab', async () => {
    const collection = {
      version: 3,
      groups: [{ id: 'group-1', name: 'OMS', createdAt: 1 }],
      requests: [
        {
          ...emptyHttpRequestDraft(),
          id: 'request-1',
          groupId: 'group-1',
          name: '接口一',
          url: 'https://api.example.com/one',
          updatedAt: 1,
        },
        {
          ...emptyHttpRequestDraft(),
          id: 'request-2',
          groupId: 'group-1',
          name: '接口二',
          url: 'https://api.example.com/two',
          updatedAt: 1,
        },
      ],
    }
    getSetting.mockImplementation(async (key: string) => key === 'http.collections' ? collection : undefined)
    const wrapper = mountTool()
    await flushPromises()

    await buttonContainingText(wrapper, '接口一').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-testid="http-request-tab"]')).toHaveLength(1)

    await buttonContainingText(wrapper, '接口二').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-testid="http-request-tab"]')).toHaveLength(2)
    expect((wrapper.get('input[placeholder="https://api.example.com/v1/..."]').element as HTMLInputElement).value).toBe('https://api.example.com/two')

    await buttonContainingText(wrapper, '接口一').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-testid="http-request-tab"]')).toHaveLength(2)
    expect((wrapper.get('input[placeholder="https://api.example.com/v1/..."]').element as HTMLInputElement).value).toBe('https://api.example.com/one')
  })

  it('keeps the collection sidebar outside the request-tab column', async () => {
    const wrapper = mountTool()
    await flushPromises()

    expect(wrapper.get('[data-testid="http-workspace"]').classes()).toContain('md:grid-cols-[240px_minmax(0,1fr)]')
    expect(wrapper.get('[data-testid="http-collection-sidebar"]').classes()).toContain('md:row-span-4')
  })

  it('sends selected files as multipart metadata to the native request command', async () => {
    openFile.mockResolvedValue('D:\\fixtures\\avatar.png')
    vi.mocked(invoke).mockResolvedValue({
      ok: true,
      status: 201,
      statusText: 'Created',
      headers: [],
      body: '{}',
      durationMs: 15,
      sizeBytes: 2,
      truncated: false,
      finalUrl: 'https://httpbin.org/get',
      error: null,
    })
    const wrapper = mountTool()
    await flushPromises()

    await buttonByText(wrapper, 'Body').trigger('click')
    const bodyTypeSelect = wrapper.findAll('select').find(item => item.find('option[value="multipart"]').exists())!
    await bodyTypeSelect.setValue('multipart')
    const partKindSelect = wrapper.findAll('select').find(item => item.find('option[value="file"]').exists())!
    await partKindSelect.setValue('file')
    await wrapper.get('input[placeholder="字段名"]').setValue('avatar')
    await buttonByText(wrapper, '选择').trigger('click')
    await flushPromises()
    await buttonByText(wrapper, 'Send').trigger('click')
    await flushPromises()

    const input = vi.mocked(invoke).mock.calls[0][1]!.input
    expect(input).toMatchObject({
      bodyType: 'multipart',
      multipart: [{
        kind: 'file',
        name: 'avatar',
        filePath: 'D:\\fixtures\\avatar.png',
        fileName: 'avatar.png',
        enabled: true,
      }],
    })
  })

  it('restores a persisted history request into the active tab', async () => {
    const draft = emptyHttpRequestDraft()
    draft.url = 'https://example.com/from-history'
    getSetting.mockImplementation(async (key: string) => key === 'http.history'
      ? [{
          id: 'history-1',
          at: 1,
          status: 200,
          statusText: 'OK',
          durationMs: 12,
          request: draft,
        }]
      : undefined)
    const wrapper = mountTool()
    await flushPromises()

    await wrapper.get('[data-testid="recent-request"]').trigger('click')
    expect((wrapper.get('input[placeholder="https://api.example.com/v1/..."]').element as HTMLInputElement).value).toBe('https://example.com/from-history')
  })
})

describe('http tool response viewer', () => {
  beforeEach(() => {
    getSetting.mockReset().mockResolvedValue(undefined)
    setSetting.mockReset().mockResolvedValue(undefined)
    vi.mocked(invoke).mockReset()
    openFile.mockReset()
    readTextFile.mockReset()
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

  it('runs configured response assertions and shows visible results', async () => {
    const workspace = emptyHttpWorkspace()
    workspace.tabs[0].request.assertions = [
      { id: 'assertion-1', type: 'status-equals', target: '', expected: '201', enabled: true },
      { id: 'assertion-2', type: 'json-path-equals', target: '$.data.id', expected: '42', enabled: true },
    ]
    getSetting.mockImplementation(async (key: string) => key === 'http.workspace' ? workspace : undefined)
    vi.mocked(invoke).mockResolvedValue({
      ok: true,
      status: 201,
      statusText: 'Created',
      headers: [],
      body: '{"data":{"id":42}}',
      durationMs: 10,
      sizeBytes: 18,
      truncated: false,
      finalUrl: 'https://httpbin.org/get',
      error: null,
    })
    const wrapper = mountTool()
    await flushPromises()

    await buttonByText(wrapper, 'Send').trigger('click')
    await flushPromises()

    const results = wrapper.get('[data-testid="http-assertion-results"]')
    expect(results.text()).toContain('通过 · 状态码等于')
    expect(results.text()).toContain('通过 · JSON Path 等于')
    expect(buttonContainingText(wrapper, 'Tests').text()).toContain('2/2')
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

  it('persists request history and keeps it in a fixed-height scroll area', async () => {
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
    expect(history.findAll('[data-testid="recent-request"]')).toHaveLength(6)
    expect(history.text()).toContain('request-5')
    expect(history.text()).toContain('request-0')
    expect(storedValue('http.history')).toHaveLength(6)
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
