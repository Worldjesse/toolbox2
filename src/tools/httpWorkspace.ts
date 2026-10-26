import type { HttpAssertion } from './httpAssertions'
import type {
  HttpAuth,
  HttpBodyType,
  HttpCookie,
  HttpKeyValue,
  HttpMultipartPart,
  SavedHttpRequest,
} from './httpCollections'
import { cloneHttpAssertions, normalizeHttpAssertions } from './httpAssertions'
import {
  cloneHttpAuth,
  cloneHttpCookies,
  cloneHttpKeyValues,
  cloneHttpMultipart,
  defaultHttpAuth,
} from './httpCollections'

export interface HttpRequestDraft {
  method: string
  url: string
  timeoutMs: number
  query: HttpKeyValue[]
  headers: HttpKeyValue[]
  bodyType: HttpBodyType
  body: string
  auth: HttpAuth
  cookies: HttpCookie[]
  multipart: HttpMultipartPart[]
  variables: HttpKeyValue[]
  assertions: HttpAssertion[]
}

export interface HttpEnvironment {
  id: string
  name: string
  variables: HttpKeyValue[]
}

export interface HttpRequestTab {
  id: string
  title: string
  activeRequestId: string
  request: HttpRequestDraft
  updatedAt: number
}

export interface HttpWorkspaceState {
  version: 2
  globalVariables: HttpKeyValue[]
  activeEnvironmentId: string
  environments: HttpEnvironment[]
  cookieJar: HttpCookie[]
  activeTabId: string
  tabs: HttpRequestTab[]
}

export interface HttpHistoryEntry {
  id: string
  at: number
  status: number
  statusText: string
  durationMs: number
  request: HttpRequestDraft
}

export function emptyHttpRequestDraft(): HttpRequestDraft {
  return {
    method: 'GET',
    url: 'https://httpbin.org/get',
    timeoutMs: 30_000,
    query: [{ key: '', value: '', enabled: true }],
    headers: [
      { key: 'Accept', value: 'application/json', enabled: true },
      { key: '', value: '', enabled: true },
    ],
    bodyType: 'none',
    body: '',
    auth: defaultHttpAuth(),
    cookies: [],
    multipart: [],
    variables: [],
    assertions: [],
  }
}

export function cloneHttpRequestDraft(draft: HttpRequestDraft): HttpRequestDraft {
  return {
    ...draft,
    query: cloneHttpKeyValues(draft.query),
    headers: cloneHttpKeyValues(draft.headers),
    auth: cloneHttpAuth(draft.auth),
    cookies: cloneHttpCookies(draft.cookies),
    multipart: cloneHttpMultipart(draft.multipart),
    variables: cloneHttpKeyValues(draft.variables),
    assertions: cloneHttpAssertions(draft.assertions),
  }
}

export function requestDraftFromSaved(request: SavedHttpRequest): HttpRequestDraft {
  return cloneHttpRequestDraft(request)
}

export function createHttpRequestTab(title = '新请求'): HttpRequestTab {
  return {
    id: crypto.randomUUID(),
    title,
    activeRequestId: '',
    request: emptyHttpRequestDraft(),
    updatedAt: Date.now(),
  }
}

export function emptyHttpWorkspace(): HttpWorkspaceState {
  const tab = createHttpRequestTab()
  const environment: HttpEnvironment = {
    id: crypto.randomUUID(),
    name: '本地环境',
    variables: [{ key: 'baseUrl', value: '', enabled: true }],
  }
  return {
    version: 2,
    globalVariables: [{ key: '', value: '', enabled: true }],
    activeEnvironmentId: environment.id,
    environments: [environment],
    cookieJar: [],
    activeTabId: tab.id,
    tabs: [tab],
  }
}

function normalizeDraft(value: unknown): HttpRequestDraft {
  const source = value && typeof value === 'object' ? value as Partial<HttpRequestDraft> : {}
  const base = emptyHttpRequestDraft()
  return {
    method: typeof source.method === 'string' ? source.method : base.method,
    url: typeof source.url === 'string' ? source.url : base.url,
    timeoutMs: typeof source.timeoutMs === 'number' ? source.timeoutMs : base.timeoutMs,
    query: cloneHttpKeyValues(Array.isArray(source.query) ? source.query : base.query),
    headers: cloneHttpKeyValues(Array.isArray(source.headers) ? source.headers : base.headers),
    bodyType: ['none', 'json', 'text', 'form', 'multipart'].includes(source.bodyType ?? '')
      ? source.bodyType as HttpBodyType
      : base.bodyType,
    body: typeof source.body === 'string' ? source.body : '',
    auth: { ...defaultHttpAuth(), ...(source.auth ?? {}) },
    cookies: cloneHttpCookies(Array.isArray(source.cookies) ? source.cookies : []),
    multipart: cloneHttpMultipart(Array.isArray(source.multipart) ? source.multipart : []),
    variables: cloneHttpKeyValues(Array.isArray(source.variables) ? source.variables : []),
    assertions: normalizeHttpAssertions(source.assertions),
  }
}

export function normalizeHttpWorkspace(value: unknown): HttpWorkspaceState {
  if (!value || typeof value !== 'object')
    return emptyHttpWorkspace()

  const source = value as Partial<HttpWorkspaceState>
  const environments = Array.isArray(source.environments)
    ? source.environments.filter(item => item && typeof item.id === 'string' && typeof item.name === 'string').map(item => ({
        id: item.id,
        name: item.name,
        variables: cloneHttpKeyValues(Array.isArray(item.variables) ? item.variables : []),
      }))
    : []
  const tabs = Array.isArray(source.tabs)
    ? source.tabs.filter(item => item && typeof item.id === 'string').map(item => ({
        id: item.id,
        title: typeof item.title === 'string' && item.title ? item.title : '新请求',
        activeRequestId: typeof item.activeRequestId === 'string' ? item.activeRequestId : '',
        request: normalizeDraft(item.request),
        updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
      }))
    : []

  const fallback = emptyHttpWorkspace()
  const normalizedEnvironments = environments.length ? environments : fallback.environments
  const normalizedTabs = tabs.length ? tabs : fallback.tabs
  return {
    version: 2,
    globalVariables: cloneHttpKeyValues(Array.isArray(source.globalVariables) ? source.globalVariables : []),
    activeEnvironmentId: normalizedEnvironments.some(item => item.id === source.activeEnvironmentId)
      ? source.activeEnvironmentId!
      : normalizedEnvironments[0].id,
    environments: normalizedEnvironments,
    cookieJar: cloneHttpCookies(Array.isArray(source.cookieJar) ? source.cookieJar : []),
    activeTabId: normalizedTabs.some(item => item.id === source.activeTabId)
      ? source.activeTabId!
      : normalizedTabs[0].id,
    tabs: normalizedTabs,
  }
}

export function normalizeHttpHistory(value: unknown): HttpHistoryEntry[] {
  if (!Array.isArray(value))
    return []
  return value.filter(item => (
    item
    && typeof item.id === 'string'
    && typeof item.at === 'number'
    && item.request
  )).map(item => ({
    id: item.id,
    at: item.at,
    status: typeof item.status === 'number' ? item.status : 0,
    statusText: typeof item.statusText === 'string' ? item.statusText : '',
    durationMs: typeof item.durationMs === 'number' ? item.durationMs : 0,
    request: normalizeDraft(item.request),
  }))
}

export function environmentVariableMap(environment?: HttpEnvironment) {
  const values: Record<string, string> = {}
  for (const row of environment?.variables ?? []) {
    const key = row.key.trim()
    if (row.enabled && key)
      values[key] = row.value
  }
  return values
}

export function scopedHttpVariableMap(
  globalVariables: HttpKeyValue[],
  environment?: HttpEnvironment,
  requestVariables: HttpKeyValue[] = [],
) {
  const values: Record<string, string> = {}
  const assign = (rows: HttpKeyValue[]) => {
    for (const row of rows) {
      const key = row.key.trim()
      if (row.enabled && key)
        values[key] = row.value
    }
  }
  assign(globalVariables)
  assign(environment?.variables ?? [])
  assign(requestVariables)
  return values
}

export function interpolateHttpValue(value: string, variables: Record<string, string>) {
  const missing = new Set<string>()
  const resolved = value.replace(/\{\{([^{}]*)\}\}/g, (match, rawName: string) => {
    const name = rawName.trim()
    if (!name)
      return match
    if (!Object.hasOwn(variables, name)) {
      missing.add(name)
      return `{{${name}}}`
    }
    return variables[name]
  })
  return { value: resolved, missing: [...missing] }
}

export function cookiesForUrl(cookies: HttpCookie[], rawUrl: string, now = Date.now()) {
  let url: URL
  try {
    url = new URL(rawUrl)
  }
  catch {
    return []
  }
  return cookies.filter((cookie) => {
    if (!cookie.enabled || !cookie.name.trim())
      return false
    if (cookie.expiresAt && cookie.expiresAt <= now)
      return false
    if (cookie.secure && url.protocol !== 'https:')
      return false
    const domain = cookie.domain.replace(/^\./, '').toLocaleLowerCase()
    const hostname = url.hostname.toLocaleLowerCase()
    if (domain && hostname !== domain && !hostname.endsWith(`.${domain}`))
      return false
    return url.pathname.startsWith(cookie.path || '/')
  })
}

export function captureResponseCookies(headers: HttpKeyValue[], finalUrl: string, existing: HttpCookie[]) {
  let url: URL
  try {
    url = new URL(finalUrl)
  }
  catch {
    return cloneHttpCookies(existing)
  }

  const result = cloneHttpCookies(existing)
  for (const header of headers) {
    if (header.key.toLocaleLowerCase() !== 'set-cookie')
      continue
    const segments = header.value.split(';').map(item => item.trim())
    const [nameValue, ...attributes] = segments
    const separator = nameValue.indexOf('=')
    if (separator <= 0)
      continue
    const cookie: HttpCookie = {
      id: crypto.randomUUID(),
      name: nameValue.slice(0, separator).trim(),
      value: nameValue.slice(separator + 1),
      domain: url.hostname,
      path: '/',
      enabled: true,
      secure: false,
      httpOnly: false,
      expiresAt: null,
    }
    for (const attribute of attributes) {
      const [rawKey, ...rawValue] = attribute.split('=')
      const key = rawKey.toLocaleLowerCase()
      const value = rawValue.join('=')
      if (key === 'domain' && value) {
        cookie.domain = value
      }
      else if (key === 'path' && value) {
        cookie.path = value
      }
      else if (key === 'secure') {
        cookie.secure = true
      }
      else if (key === 'httponly') {
        cookie.httpOnly = true
      }
      else if (key === 'max-age' && Number.isFinite(Number(value))) {
        cookie.expiresAt = Date.now() + Number(value) * 1000
      }
      else if (key === 'expires') {
        const expires = Date.parse(value)
        if (Number.isFinite(expires))
          cookie.expiresAt = expires
      }
    }
    const previous = result.findIndex(item => (
      item.name === cookie.name
      && item.domain === cookie.domain
      && item.path === cookie.path
    ))
    if (cookie.expiresAt && cookie.expiresAt <= Date.now()) {
      if (previous >= 0)
        result.splice(previous, 1)
      continue
    }
    if (previous >= 0)
      result.splice(previous, 1, cookie)
    else
      result.push(cookie)
  }
  return result
}
