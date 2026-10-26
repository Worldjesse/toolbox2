import type { HttpAssertion } from './httpAssertions'
import { normalizeHttpAssertions } from './httpAssertions'

export interface HttpKeyValue {
  key: string
  value: string
  enabled: boolean
}

export type HttpBodyType = 'none' | 'json' | 'text' | 'form' | 'multipart'

export type HttpAuthType = 'none' | 'bearer' | 'basic' | 'api-key'

export interface HttpAuth {
  type: HttpAuthType
  token: string
  username: string
  password: string
  key: string
  value: string
  addTo: 'header' | 'query'
}

export interface HttpCookie {
  id: string
  name: string
  value: string
  domain: string
  path: string
  enabled: boolean
  secure?: boolean
  httpOnly?: boolean
  expiresAt?: number | null
}

export interface HttpMultipartPart {
  id: string
  kind: 'text' | 'file'
  name: string
  value: string
  filePath: string
  fileName: string
  contentType: string
  enabled: boolean
}

export interface SavedHttpRequest {
  id: string
  groupId: string
  name: string
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
  updatedAt: number
}

export interface HttpRequestGroup {
  id: string
  name: string
  createdAt: number
}

export interface HttpCollectionState {
  version: 3
  groups: HttpRequestGroup[]
  requests: SavedHttpRequest[]
}

export function emptyHttpCollection(): HttpCollectionState {
  return { version: 3, groups: [], requests: [] }
}

export function defaultHttpAuth(): HttpAuth {
  return {
    type: 'none',
    token: '',
    username: '',
    password: '',
    key: 'X-Api-Key',
    value: '',
    addTo: 'header',
  }
}

export function cloneHttpKeyValues(rows: HttpKeyValue[]): HttpKeyValue[] {
  return rows.map(row => ({
    key: row.key,
    value: row.value,
    enabled: row.enabled,
  }))
}

export function cloneHttpAuth(auth: HttpAuth): HttpAuth {
  return { ...auth }
}

export function cloneHttpCookies(cookies: HttpCookie[]): HttpCookie[] {
  return cookies.map(cookie => ({ ...cookie }))
}

export function cloneHttpMultipart(parts: HttpMultipartPart[]): HttpMultipartPart[] {
  return parts.map(part => ({ ...part }))
}

function normalizeAuth(value: unknown): HttpAuth {
  const source = value && typeof value === 'object' ? value as Partial<HttpAuth> : {}
  const type = ['none', 'bearer', 'basic', 'api-key'].includes(source.type ?? '')
    ? source.type as HttpAuthType
    : 'none'
  return {
    ...defaultHttpAuth(),
    ...source,
    type,
    addTo: source.addTo === 'query' ? 'query' : 'header',
  }
}

function normalizeCookies(value: unknown): HttpCookie[] {
  if (!Array.isArray(value))
    return []
  return value.filter(cookie => cookie && typeof cookie.name === 'string').map(cookie => ({
    id: typeof cookie.id === 'string' ? cookie.id : crypto.randomUUID(),
    name: cookie.name,
    value: typeof cookie.value === 'string' ? cookie.value : '',
    domain: typeof cookie.domain === 'string' ? cookie.domain : '',
    path: typeof cookie.path === 'string' ? cookie.path : '/',
    enabled: cookie.enabled !== false,
    secure: Boolean(cookie.secure),
    httpOnly: Boolean(cookie.httpOnly),
    expiresAt: typeof cookie.expiresAt === 'number' ? cookie.expiresAt : null,
  }))
}

function normalizeMultipart(value: unknown): HttpMultipartPart[] {
  if (!Array.isArray(value))
    return []
  return value.filter(part => part && typeof part.name === 'string').map(part => ({
    id: typeof part.id === 'string' ? part.id : crypto.randomUUID(),
    kind: part.kind === 'file' ? 'file' : 'text',
    name: part.name,
    value: typeof part.value === 'string' ? part.value : '',
    filePath: typeof part.filePath === 'string' ? part.filePath : '',
    fileName: typeof part.fileName === 'string' ? part.fileName : '',
    contentType: typeof part.contentType === 'string' ? part.contentType : '',
    enabled: part.enabled !== false,
  }))
}

export function normalizeHttpCollection(value: unknown): HttpCollectionState {
  if (!value || typeof value !== 'object')
    return emptyHttpCollection()

  const source = value as Partial<HttpCollectionState>
  const groups = Array.isArray(source.groups)
    ? source.groups.filter(group => group && typeof group.id === 'string' && typeof group.name === 'string')
    : []
  const groupIds = new Set(groups.map(group => group.id))
  const requests = Array.isArray(source.requests)
    ? source.requests.filter(request => (
        request
        && typeof request.id === 'string'
        && typeof request.groupId === 'string'
        && groupIds.has(request.groupId)
        && typeof request.name === 'string'
      )).map(request => ({
        ...request,
        method: typeof request.method === 'string' ? request.method : 'GET',
        url: typeof request.url === 'string' ? request.url : '',
        timeoutMs: typeof request.timeoutMs === 'number' ? request.timeoutMs : 30_000,
        query: cloneHttpKeyValues(Array.isArray(request.query) ? request.query : []),
        headers: cloneHttpKeyValues(Array.isArray(request.headers) ? request.headers : []),
        bodyType: ['none', 'json', 'text', 'form', 'multipart'].includes(request.bodyType)
          ? request.bodyType
          : 'none',
        body: typeof request.body === 'string' ? request.body : '',
        auth: normalizeAuth(request.auth),
        cookies: normalizeCookies(request.cookies),
        multipart: normalizeMultipart(request.multipart),
        variables: cloneHttpKeyValues(Array.isArray(request.variables) ? request.variables : []),
        assertions: normalizeHttpAssertions(request.assertions),
        updatedAt: typeof request.updatedAt === 'number' ? request.updatedAt : Date.now(),
      } as SavedHttpRequest))
    : []

  return { version: 3, groups, requests }
}

export function filterHttpRequests(requests: SavedHttpRequest[], term: string) {
  const normalized = term.trim().toLocaleLowerCase()
  if (!normalized)
    return requests
  return requests.filter(request => (
    request.name.toLocaleLowerCase().includes(normalized)
    || request.url.toLocaleLowerCase().includes(normalized)
    || request.method.toLocaleLowerCase().includes(normalized)
  ))
}

export function requestCountForGroup(requests: SavedHttpRequest[], groupId: string) {
  return requests.filter(request => request.groupId === groupId).length
}
