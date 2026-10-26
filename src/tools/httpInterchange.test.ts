import type { HttpCollectionState, SavedHttpRequest } from './httpCollections'
import { describe, expect, it } from 'vitest'
import { defaultHttpAuth } from './httpCollections'
import {
  exportOpenApiCollection,
  exportPostmanCollection,
  exportRequestAsCurl,
  importCurl,
  importOpenApiDocument,
  importPostmanCollection,
  mergeImportedHttpProject,
} from './httpInterchange'

const request: SavedHttpRequest = {
  id: 'request-1',
  groupId: 'group-1',
  name: '创建用户',
  method: 'POST',
  url: '{{baseUrl}}/users',
  timeoutMs: 30_000,
  query: [{ key: 'verbose', value: 'true', enabled: true }],
  headers: [{ key: 'Accept', value: 'application/json', enabled: true }],
  bodyType: 'json',
  body: '{"name":"Ada"}',
  auth: { ...defaultHttpAuth(), type: 'bearer', token: '{{token}}' },
  cookies: [],
  multipart: [],
  variables: [{ key: 'token', value: 'secret', enabled: true }],
  assertions: [{ id: 'assertion-1', type: 'status-equals', target: '', expected: '201', enabled: true }],
  updatedAt: 1,
}

const collection: HttpCollectionState = {
  version: 3,
  groups: [{ id: 'group-1', name: 'Users', createdAt: 1 }],
  requests: [request],
}

describe('http interchange', () => {
  it('imports a cURL command with headers, auth, query and JSON body', () => {
    const project = importCurl(`curl 'https://api.example.com/users?verbose=true' \\
      -X POST -H 'Authorization: Bearer local-token' \\
      -H 'Content-Type: application/json' --data-raw '{"name":"Ada"}'`)
    const imported = project.groups[0].requests[0]

    expect(imported).toMatchObject({
      method: 'POST',
      url: 'https://api.example.com/users',
      query: [{ key: 'verbose', value: 'true', enabled: true }],
      bodyType: 'json',
      body: '{"name":"Ada"}',
      auth: { type: 'bearer', token: 'local-token' },
    })
  })

  it('exports the active request as a reusable cURL command', () => {
    const output = exportRequestAsCurl(request)

    expect(output).toContain('curl -X POST \'{{baseUrl}}/users?verbose=true\'')
    expect(output).toContain('Authorization: Bearer {{token}}')
    expect(output).toContain('--data-raw \'{"name":"Ada"}\'')
  })

  it('round-trips Postman collections including Toolbox variables and assertions', () => {
    const output = exportPostmanCollection(collection, [{ key: 'baseUrl', value: 'https://api.example.com', enabled: true }])
    const imported = importPostmanCollection(output)

    expect(imported.globalVariables).toMatchObject([{ key: 'baseUrl', value: 'https://api.example.com' }])
    expect(imported.groups[0].requests[0]).toMatchObject({
      name: '创建用户',
      method: 'POST',
      variables: [{ key: 'token', value: 'secret', enabled: true }],
      assertions: [{ type: 'status-equals', expected: '201' }],
    })
  })

  it('round-trips OpenAPI JSON and imports OpenAPI YAML', () => {
    const output = exportOpenApiCollection(collection, 'json', [{ key: 'baseUrl', value: 'https://api.example.com', enabled: true }])
    const roundTrip = importOpenApiDocument(output)
    expect(roundTrip.groups[0].requests[0]).toMatchObject({
      name: '创建用户',
      url: '{{baseUrl}}/users',
      method: 'POST',
      bodyType: 'json',
    })

    const yaml = `openapi: 3.0.3
info:
  title: Store API
  version: 1.0.0
servers:
  - url: https://api.example.com
paths:
  /stores:
    get:
      summary: 查询店铺
      parameters:
        - in: query
          name: status
          schema:
            type: string
            example: OPEN
      responses:
        '200':
          description: ok
`
    const imported = importOpenApiDocument(yaml)
    expect(imported.globalVariables[0]).toMatchObject({ key: 'baseUrl', value: 'https://api.example.com' })
    expect(imported.groups[0].requests[0]).toMatchObject({
      name: '查询店铺',
      url: '{{baseUrl}}/stores',
      query: [{ key: 'status', value: 'OPEN', enabled: true }],
    })
  })

  it('merges imported groups without overwriting existing data', () => {
    const imported = importCurl('curl \'https://api.example.com/health\'')
    imported.groups[0].name = 'Users'
    const result = mergeImportedHttpProject(collection, [], imported)

    expect(result.collection.groups.map(group => group.name)).toEqual(['Users', 'Users (2)'])
    expect(result.collection.requests).toHaveLength(2)
    expect(result.requestCount).toBe(1)
  })
})
