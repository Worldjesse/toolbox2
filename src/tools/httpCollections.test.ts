import type { SavedHttpRequest } from './httpCollections'
import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { cloneHttpKeyValues, defaultHttpAuth, filterHttpRequests, normalizeHttpCollection, requestCountForGroup } from './httpCollections'

const request: SavedHttpRequest = {
  id: 'request-1',
  groupId: 'group-1',
  name: '查询店铺权限',
  method: 'POST',
  url: 'https://example.com/store-permission',
  timeoutMs: 30000,
  query: [],
  headers: [],
  bodyType: 'json',
  body: '{}',
  auth: defaultHttpAuth(),
  cookies: [],
  multipart: [],
  variables: [],
  assertions: [],
  updatedAt: 1,
}

describe('http collections', () => {
  it('copies Vue reactive request rows into plain serializable objects', () => {
    const source = reactive([{ key: 'Content-Type', value: 'application/json', enabled: true }])
    const copy = cloneHttpKeyValues(source)

    expect(copy).toEqual(source)
    expect(copy[0]).not.toBe(source[0])
    expect(() => structuredClone(copy)).not.toThrow()
  })

  it('drops malformed and orphaned records from persisted data', () => {
    const state = normalizeHttpCollection({
      groups: [{ id: 'group-1', name: 'OMS', createdAt: 1 }],
      requests: [request, { ...request, id: 'orphan', groupId: 'missing' }],
    })

    expect(state.groups).toHaveLength(1)
    expect(state.requests.map(item => item.id)).toEqual(['request-1'])
    expect(state.version).toBe(3)
  })

  it('migrates version 1 requests with defaults for phase-one fields', () => {
    const legacy = { ...request } as Partial<SavedHttpRequest>
    delete legacy.auth
    delete legacy.cookies
    delete legacy.multipart
    delete legacy.variables
    delete legacy.assertions

    const state = normalizeHttpCollection({
      version: 1,
      groups: [{ id: 'group-1', name: 'OMS', createdAt: 1 }],
      requests: [legacy],
    })

    expect(state.requests[0]).toMatchObject({
      auth: { type: 'none' },
      cookies: [],
      multipart: [],
      variables: [],
      assertions: [],
    })
  })

  it('searches saved requests by name, url and method', () => {
    expect(filterHttpRequests([request], '店铺')).toHaveLength(1)
    expect(filterHttpRequests([request], 'permission')).toHaveLength(1)
    expect(filterHttpRequests([request], 'post')).toHaveLength(1)
    expect(filterHttpRequests([request], 'DELETE')).toHaveLength(0)
  })

  it('counts requests within a group', () => {
    expect(requestCountForGroup([request, { ...request, id: 'request-2' }], 'group-1')).toBe(2)
  })
})
