export interface HttpKeyValue {
  key: string
  value: string
  enabled: boolean
}

export type HttpBodyType = 'none' | 'json' | 'text' | 'form'

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
  updatedAt: number
}

export interface HttpRequestGroup {
  id: string
  name: string
  createdAt: number
}

export interface HttpCollectionState {
  version: 1
  groups: HttpRequestGroup[]
  requests: SavedHttpRequest[]
}

export function emptyHttpCollection(): HttpCollectionState {
  return { version: 1, groups: [], requests: [] }
}

export function cloneHttpKeyValues(rows: HttpKeyValue[]): HttpKeyValue[] {
  return rows.map(row => ({
    key: row.key,
    value: row.value,
    enabled: row.enabled,
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
      ))
    : []

  return { version: 1, groups, requests }
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
