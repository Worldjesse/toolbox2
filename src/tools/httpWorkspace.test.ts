import { describe, expect, it, vi } from 'vitest'
import {
  captureResponseCookies,
  cookiesForUrl,
  emptyHttpWorkspace,
  environmentVariableMap,
  interpolateHttpValue,
  normalizeHttpHistory,
  normalizeHttpWorkspace,
  scopedHttpVariableMap,
} from './httpWorkspace'

describe('http workspace', () => {
  it('normalizes malformed workspace data and always keeps an environment and tab', () => {
    const state = normalizeHttpWorkspace({ environments: [], tabs: [], cookieJar: [] })

    expect(state.environments).toHaveLength(1)
    expect(state.tabs).toHaveLength(1)
    expect(state.activeEnvironmentId).toBe(state.environments[0].id)
    expect(state.activeTabId).toBe(state.tabs[0].id)
  })

  it('resolves enabled environment variables and reports missing names', () => {
    const state = emptyHttpWorkspace()
    state.environments[0].variables = [
      { key: 'baseUrl', value: 'https://api.example.com', enabled: true },
      { key: 'token', value: 'secret', enabled: false },
    ]

    const variables = environmentVariableMap(state.environments[0])
    expect(interpolateHttpValue('{{baseUrl}}/stores/{{storeId}}', variables)).toEqual({
      value: 'https://api.example.com/stores/{{storeId}}',
      missing: ['storeId'],
    })
  })

  it('resolves variable scopes with request values taking precedence', () => {
    const state = emptyHttpWorkspace()
    state.globalVariables = [
      { key: 'host', value: 'global.example.com', enabled: true },
      { key: 'shared', value: 'global', enabled: true },
    ]
    state.environments[0].variables = [
      { key: 'shared', value: 'environment', enabled: true },
      { key: 'region', value: 'cn', enabled: true },
    ]
    const requestVariables = [
      { key: 'shared', value: 'request', enabled: true },
      { key: 'region', value: 'us', enabled: false },
    ]

    expect(scopedHttpVariableMap(state.globalVariables, state.environments[0], requestVariables)).toEqual({
      host: 'global.example.com',
      shared: 'request',
      region: 'cn',
    })
  })

  it('captures Set-Cookie values and applies domain, path and secure rules', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const jar = captureResponseCookies([
      { key: 'Set-Cookie', value: 'sid=abc; Path=/api; HttpOnly; Secure; Max-Age=60', enabled: true },
    ], 'https://api.example.com/login', [])

    expect(jar[0]).toMatchObject({
      name: 'sid',
      value: 'abc',
      domain: 'api.example.com',
      path: '/api',
      secure: true,
      httpOnly: true,
      expiresAt: 61_000,
    })
    expect(cookiesForUrl(jar, 'https://api.example.com/api/users', 2_000)).toHaveLength(1)
    expect(cookiesForUrl(jar, 'http://api.example.com/api/users', 2_000)).toHaveLength(0)
    expect(cookiesForUrl(jar, 'https://api.example.com/other', 2_000)).toHaveLength(0)
    vi.restoreAllMocks()
  })

  it('drops malformed history records and restores request defaults', () => {
    const history = normalizeHttpHistory([
      {
        id: 'history-1',
        at: 1,
        status: 200,
        statusText: 'OK',
        durationMs: 12,
        request: { method: 'GET', url: 'https://example.com' },
      },
      { id: 'broken' },
    ])

    expect(history).toHaveLength(1)
    expect(history[0].request).toMatchObject({
      method: 'GET',
      url: 'https://example.com',
      bodyType: 'none',
      auth: { type: 'none' },
      variables: [],
      assertions: [],
    })
  })
})
