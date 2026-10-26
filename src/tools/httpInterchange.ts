import type {
  HttpAuth,
  HttpBodyType,
  HttpCollectionState,
  HttpKeyValue,
  HttpMultipartPart,
  SavedHttpRequest,
} from './httpCollections'
import type { HttpRequestDraft } from './httpWorkspace'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { cloneHttpAssertions, normalizeHttpAssertions } from './httpAssertions'
import {
  cloneHttpAuth,
  cloneHttpKeyValues,
  cloneHttpMultipart,
  defaultHttpAuth,
} from './httpCollections'

export type HttpImportFormat = 'curl' | 'postman' | 'openapi'
export type HttpExportFormat = 'curl' | 'postman' | 'openapi-json' | 'openapi-yaml'

type ImportedRequest = Omit<SavedHttpRequest, 'id' | 'groupId' | 'updatedAt'>
type JsonRecord = Record<string, unknown>

export interface ImportedHttpGroup {
  name: string
  requests: ImportedRequest[]
}

export interface ImportedHttpProject {
  name: string
  globalVariables: HttpKeyValue[]
  groups: ImportedHttpGroup[]
}

export interface HttpImportMergeResult {
  collection: HttpCollectionState
  globalVariables: HttpKeyValue[]
  groupCount: number
  requestCount: number
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function text(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function rows(value: unknown): HttpKeyValue[] {
  if (!Array.isArray(value))
    return []
  return value.map((item) => {
    const source = record(item)
    return {
      key: text(source.key),
      value: text(source.value),
      enabled: source.disabled !== true && source.enabled !== false,
    }
  })
}

function defaultRequest(name: string, url: string): ImportedRequest {
  return {
    name,
    method: 'GET',
    url,
    timeoutMs: 30_000,
    query: [],
    headers: [],
    bodyType: 'none',
    body: '',
    auth: defaultHttpAuth(),
    cookies: [],
    multipart: [],
    variables: [],
    assertions: [],
  }
}

function requestName(method: string, rawUrl: string) {
  try {
    const parsed = new URL(rawUrl.replace(/\{\{[^{}]+\}\}/g, 'variable'))
    return parsed.pathname.split('/').filter(Boolean).at(-1) || parsed.hostname
  }
  catch {
    return `${method} 请求`
  }
}

function splitUrl(rawUrl: string) {
  const hashIndex = rawUrl.indexOf('#')
  const withoutHash = hashIndex >= 0 ? rawUrl.slice(0, hashIndex) : rawUrl
  const queryIndex = withoutHash.indexOf('?')
  if (queryIndex < 0)
    return { url: withoutHash, query: [] as HttpKeyValue[] }
  const query = [...new URLSearchParams(withoutHash.slice(queryIndex + 1)).entries()].map(([key, value]) => ({
    key,
    value,
    enabled: true,
  }))
  return { url: withoutHash.slice(0, queryIndex), query }
}

function appendQuery(rawUrl: string, query: HttpKeyValue[]) {
  const enabled = query.filter(row => row.enabled && row.key.trim())
  if (!enabled.length)
    return rawUrl
  const separator = rawUrl.includes('?') ? '&' : '?'
  const value = enabled.map(row => `${encodeURIComponent(row.key)}=${encodeURIComponent(row.value)}`).join('&')
  return `${rawUrl}${separator}${value}`
}

function shellQuote(value: string) {
  return `'${value.replaceAll('\'', '\'\\\'\'')}'`
}

function tokenizeCommand(command: string) {
  const source = command.replace(/\\\r?\n/g, ' ').replace(/`\r?\n/g, ' ')
  const tokens: string[] = []
  let token = ''
  let quote = ''
  let escaped = false
  for (const character of source) {
    if (escaped) {
      token += character
      escaped = false
      continue
    }
    if (character === '\\' && quote !== '\'') {
      escaped = true
      continue
    }
    if (quote) {
      if (character === quote)
        quote = ''
      else
        token += character
      continue
    }
    if (character === '\'' || character === '"') {
      quote = character
      continue
    }
    if (/\s/.test(character)) {
      if (token) {
        tokens.push(token)
        token = ''
      }
      continue
    }
    token += character
  }
  if (escaped)
    token += '\\'
  if (quote)
    throw new Error('cURL 命令中的引号未闭合')
  if (token)
    tokens.push(token)
  return tokens
}

function parseHeader(value: string): HttpKeyValue | null {
  const separator = value.indexOf(':')
  if (separator <= 0)
    return null
  return {
    key: value.slice(0, separator).trim(),
    value: value.slice(separator + 1).trim(),
    enabled: true,
  }
}

export function importCurl(command: string): ImportedHttpProject {
  const tokens = tokenizeCommand(command.trim())
  if (tokens[0]?.toLocaleLowerCase() === 'curl')
    tokens.shift()
  if (!tokens.length)
    throw new Error('请输入有效的 cURL 命令')

  let method = ''
  let rawUrl = ''
  let body = ''
  let bodyType: HttpBodyType = 'none'
  let auth = defaultHttpAuth()
  let timeoutMs = 30_000
  let useGet = false
  const headers: HttpKeyValue[] = []
  const multipart: HttpMultipartPart[] = []
  const dataParts: string[] = []
  const valueFlags = new Set([
    '-X',
    '--request',
    '-H',
    '--header',
    '-d',
    '--data',
    '--data-raw',
    '--data-binary',
    '--data-urlencode',
    '-u',
    '--user',
    '-b',
    '--cookie',
    '-F',
    '--form',
    '--url',
    '--max-time',
  ])

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    const equalsIndex = token.startsWith('--') ? token.indexOf('=') : -1
    const flag = equalsIndex > 0 ? token.slice(0, equalsIndex) : token
    const inlineValue = equalsIndex > 0 ? token.slice(equalsIndex + 1) : undefined
    const nextValue = () => {
      if (inlineValue !== undefined)
        return inlineValue
      const value = tokens[++index]
      if (value === undefined)
        throw new Error(`${flag} 缺少参数`)
      return value
    }

    if (flag === '-X' || flag === '--request') {
      method = nextValue().toUpperCase()
    }
    else if (flag === '-H' || flag === '--header') {
      const header = parseHeader(nextValue())
      if (header)
        headers.push(header)
    }
    else if (['-d', '--data', '--data-raw', '--data-binary', '--data-urlencode'].includes(flag)) {
      dataParts.push(nextValue())
    }
    else if (flag === '-F' || flag === '--form') {
      const form = nextValue()
      const separator = form.indexOf('=')
      if (separator > 0) {
        const value = form.slice(separator + 1)
        multipart.push({
          id: crypto.randomUUID(),
          kind: value.startsWith('@') ? 'file' : 'text',
          name: form.slice(0, separator),
          value: value.startsWith('@') ? '' : value,
          filePath: value.startsWith('@') ? value.slice(1) : '',
          fileName: value.startsWith('@') ? value.slice(1).split(/[\\/]/).at(-1) ?? '' : '',
          contentType: '',
          enabled: true,
        })
      }
    }
    else if (flag === '-u' || flag === '--user') {
      const value = nextValue()
      const separator = value.indexOf(':')
      auth = {
        ...defaultHttpAuth(),
        type: 'basic',
        username: separator >= 0 ? value.slice(0, separator) : value,
        password: separator >= 0 ? value.slice(separator + 1) : '',
      }
    }
    else if (flag === '-b' || flag === '--cookie') {
      headers.push({ key: 'Cookie', value: nextValue(), enabled: true })
    }
    else if (flag === '--url') {
      rawUrl = nextValue()
    }
    else if (flag === '--max-time') {
      timeoutMs = Math.max(1, Number(nextValue()) || 30) * 1000
    }
    else if (flag === '-G' || flag === '--get') {
      useGet = true
    }
    else if (!token.startsWith('-') && !rawUrl) {
      rawUrl = token
    }
    else if (valueFlags.has(flag)) {
      nextValue()
    }
  }

  if (!rawUrl)
    throw new Error('cURL 命令中没有 URL')

  const split = splitUrl(rawUrl)
  const query = [...split.query]
  if (useGet && dataParts.length) {
    for (const [key, value] of new URLSearchParams(dataParts.join('&')).entries())
      query.push({ key, value, enabled: true })
    method = method || 'GET'
  }
  else if (multipart.length) {
    bodyType = 'multipart'
    method = method || 'POST'
  }
  else if (dataParts.length) {
    body = dataParts.join('&')
    method = method || 'POST'
    const contentType = headers.find(header => header.key.toLocaleLowerCase() === 'content-type')?.value ?? ''
    bodyType = contentType.includes('json') || /^[[{]/.test(body.trim())
      ? 'json'
      : contentType.includes('x-www-form-urlencoded') ? 'form' : 'text'
  }

  const authorizationIndex = headers.findIndex(header => header.key.toLocaleLowerCase() === 'authorization')
  const authorization = headers[authorizationIndex]?.value ?? ''
  if (/^Bearer\s+/i.test(authorization)) {
    auth = { ...defaultHttpAuth(), type: 'bearer', token: authorization.replace(/^Bearer\s+/i, '') }
    headers.splice(authorizationIndex, 1)
  }

  const request = defaultRequest(requestName(method || 'GET', split.url), split.url)
  Object.assign(request, {
    method: method || 'GET',
    timeoutMs,
    query,
    headers,
    bodyType,
    body,
    auth,
    multipart,
  })
  return { name: 'cURL 导入', globalVariables: [], groups: [{ name: 'cURL 导入', requests: [request] }] }
}

export function exportRequestAsCurl(request: HttpRequestDraft) {
  const parts = ['curl', '-X', request.method.toUpperCase(), shellQuote(appendQuery(request.url, request.query))]
  for (const header of request.headers.filter(row => row.enabled && row.key.trim()))
    parts.push('-H', shellQuote(`${header.key}: ${header.value}`))
  if (request.auth.type === 'bearer' && request.auth.token) {
    parts.push('-H', shellQuote(`Authorization: Bearer ${request.auth.token}`))
  }
  else if (request.auth.type === 'basic') {
    parts.push('-u', shellQuote(`${request.auth.username}:${request.auth.password}`))
  }
  else if (request.auth.type === 'api-key' && request.auth.key) {
    if (request.auth.addTo === 'header')
      parts.push('-H', shellQuote(`${request.auth.key}: ${request.auth.value}`))
    else
      parts[3] = shellQuote(appendQuery(appendQuery(request.url, request.query), [{ key: request.auth.key, value: request.auth.value, enabled: true }]))
  }
  if (request.bodyType === 'multipart') {
    for (const part of request.multipart.filter(part => part.enabled && part.name.trim())) {
      const value = part.kind === 'file' ? `@${part.filePath}` : part.value
      parts.push('-F', shellQuote(`${part.name}=${value}`))
    }
  }
  else if (request.bodyType !== 'none' && request.body) {
    parts.push('--data-raw', shellQuote(request.body))
  }
  parts.push('--max-time', String(Math.ceil(request.timeoutMs / 1000)))
  return parts.join(' ')
}

function postmanAuth(value: unknown): HttpAuth {
  const source = record(value)
  const type = text(source.type)
  const attributes = Array.isArray(source[type]) ? source[type] as unknown[] : []
  const attribute = (key: string) => text(record(attributes.find(item => text(record(item).key) === key)).value)
  if (type === 'bearer')
    return { ...defaultHttpAuth(), type: 'bearer', token: attribute('token') }
  if (type === 'basic')
    return { ...defaultHttpAuth(), type: 'basic', username: attribute('username'), password: attribute('password') }
  if (type === 'apikey') {
    return {
      ...defaultHttpAuth(),
      type: 'api-key',
      key: attribute('key'),
      value: attribute('value'),
      addTo: attribute('in') === 'query' ? 'query' : 'header',
    }
  }
  return defaultHttpAuth()
}

function postmanUrl(value: unknown) {
  if (typeof value === 'string')
    return splitUrl(value)
  const source = record(value)
  const raw = text(source.raw)
  const split = splitUrl(raw)
  return {
    url: split.url,
    query: Array.isArray(source.query) ? rows(source.query) : split.query,
  }
}

function postmanRequest(item: JsonRecord): ImportedRequest | null {
  const source = record(item.request)
  if (!Object.keys(source).length)
    return null
  const method = text(source.method, 'GET').toUpperCase()
  const url = postmanUrl(source.url)
  const request = defaultRequest(text(item.name, requestName(method, url.url)), url.url)
  request.method = method
  request.query = url.query
  request.headers = rows(source.header)
  request.auth = postmanAuth(source.auth)
  request.variables = rows(item['x-toolbox-variables'])
  request.assertions = normalizeHttpAssertions(item['x-toolbox-assertions'])

  const body = record(source.body)
  const mode = text(body.mode)
  if (mode === 'raw') {
    request.body = text(body.raw)
    const language = text(record(body.options).raw && record(record(body.options).raw).language)
    request.bodyType = language === 'json' || /^[[{]/.test(request.body.trim()) ? 'json' : 'text'
  }
  else if (mode === 'urlencoded') {
    request.bodyType = 'form'
    request.body = rows(body.urlencoded).filter(row => row.enabled).map(row => `${encodeURIComponent(row.key)}=${encodeURIComponent(row.value)}`).join('&')
  }
  else if (mode === 'formdata') {
    request.bodyType = 'multipart'
    request.multipart = (Array.isArray(body.formdata) ? body.formdata : []).map((item) => {
      const part = record(item)
      const filePath = Array.isArray(part.src) ? text(part.src[0]) : text(part.src)
      return {
        id: crypto.randomUUID(),
        kind: part.type === 'file' ? 'file' : 'text',
        name: text(part.key),
        value: text(part.value),
        filePath,
        fileName: filePath.split(/[\\/]/).at(-1) ?? '',
        contentType: text(part.contentType),
        enabled: part.disabled !== true,
      }
    })
  }
  return request
}

export function importPostmanCollection(input: string): ImportedHttpProject {
  const document = record(JSON.parse(input))
  const info = record(document.info)
  const name = text(info.name, 'Postman 导入')
  const groups: ImportedHttpGroup[] = []
  const rootRequests: ImportedRequest[] = []

  const visit = (items: unknown[], parents: string[]) => {
    for (const value of items) {
      const item = record(value)
      if (Array.isArray(item.item)) {
        visit(item.item, [...parents, text(item.name, '未命名分组')])
        continue
      }
      const request = postmanRequest(item)
      if (!request)
        continue
      if (!parents.length) {
        rootRequests.push(request)
        continue
      }
      const groupName = parents.join(' / ')
      let group = groups.find(entry => entry.name === groupName)
      if (!group) {
        group = { name: groupName, requests: [] }
        groups.push(group)
      }
      group.requests.push(request)
    }
  }
  visit(Array.isArray(document.item) ? document.item : [], [])
  if (rootRequests.length)
    groups.unshift({ name, requests: rootRequests })
  if (!groups.length)
    throw new Error('Postman Collection 中没有可导入的请求')
  return { name, globalVariables: rows(document.variable), groups }
}

function postmanAuthExport(auth: HttpAuth): JsonRecord | undefined {
  if (auth.type === 'bearer')
    return { type: 'bearer', bearer: [{ key: 'token', value: auth.token, type: 'string' }] }
  if (auth.type === 'basic') {
    return {
      type: 'basic',
      basic: [
        { key: 'username', value: auth.username, type: 'string' },
        { key: 'password', value: auth.password, type: 'string' },
      ],
    }
  }
  if (auth.type === 'api-key') {
    return {
      type: 'apikey',
      apikey: [
        { key: 'key', value: auth.key, type: 'string' },
        { key: 'value', value: auth.value, type: 'string' },
        { key: 'in', value: auth.addTo, type: 'string' },
      ],
    }
  }
}

function postmanBodyExport(request: SavedHttpRequest): JsonRecord | undefined {
  if (request.bodyType === 'multipart') {
    return {
      mode: 'formdata',
      formdata: request.multipart.map(part => ({
        key: part.name,
        type: part.kind,
        value: part.kind === 'text' ? part.value : undefined,
        src: part.kind === 'file' ? part.filePath : undefined,
        contentType: part.contentType || undefined,
        disabled: !part.enabled,
      })),
    }
  }
  if (request.bodyType === 'form') {
    return {
      mode: 'urlencoded',
      urlencoded: [...new URLSearchParams(request.body).entries()].map(([key, value]) => ({ key, value, type: 'text' })),
    }
  }
  if (request.bodyType === 'json' || request.bodyType === 'text') {
    return {
      mode: 'raw',
      raw: request.body,
      options: { raw: { language: request.bodyType === 'json' ? 'json' : 'text' } },
    }
  }
}

export function exportPostmanCollection(collection: HttpCollectionState, globalVariables: HttpKeyValue[] = []) {
  const item = collection.groups.map(group => ({
    name: group.name,
    item: collection.requests.filter(request => request.groupId === group.id).map(request => ({
      'name': request.name,
      'request': {
        method: request.method,
        header: request.headers.map(header => ({
          key: header.key,
          value: header.value,
          type: 'text',
          disabled: !header.enabled,
        })),
        auth: postmanAuthExport(request.auth),
        body: postmanBodyExport(request),
        url: {
          raw: appendQuery(request.url, request.query),
          query: request.query.map(query => ({ key: query.key, value: query.value, disabled: !query.enabled })),
        },
      },
      'x-toolbox-variables': request.variables,
      'x-toolbox-assertions': request.assertions,
    })),
  }))
  return JSON.stringify({
    info: {
      name: 'Toolbox API Collection',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    variable: globalVariables.map(variable => ({ key: variable.key, value: variable.value, disabled: !variable.enabled })),
    item,
  }, null, 2)
}

function openApiExample(schemaValue: unknown) {
  const schema = record(schemaValue)
  if (schema.example !== undefined)
    return schema.example
  if (schema.default !== undefined)
    return schema.default
  if (schema.type === 'object') {
    const properties = record(schema.properties)
    return Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, openApiExample(value)]))
  }
  if (schema.type === 'array')
    return [openApiExample(schema.items)]
  return ''
}

function openApiSecurity(document: JsonRecord, operation: JsonRecord): HttpAuth {
  const components = record(document.components)
  const schemes = record(components.securitySchemes)
  const security = Array.isArray(operation.security)
    ? operation.security
    : Array.isArray(document.security) ? document.security : []
  const first = record(security[0])
  const name = Object.keys(first)[0]
  const scheme = record(schemes[name])
  if (scheme.type === 'http' && scheme.scheme === 'bearer')
    return { ...defaultHttpAuth(), type: 'bearer', token: `{{${name}}}` }
  if (scheme.type === 'http' && scheme.scheme === 'basic')
    return { ...defaultHttpAuth(), type: 'basic', username: '{{username}}', password: '{{password}}' }
  if (scheme.type === 'apiKey') {
    return {
      ...defaultHttpAuth(),
      type: 'api-key',
      key: text(scheme.name, name),
      value: `{{${name}}}`,
      addTo: scheme.in === 'query' ? 'query' : 'header',
    }
  }
  return defaultHttpAuth()
}

export function importOpenApiDocument(input: string): ImportedHttpProject {
  const document = record(parseYaml(input))
  if (!text(document.openapi) && !text(document.swagger))
    throw new Error('文件不是有效的 OpenAPI 文档')
  const info = record(document.info)
  const name = text(info.title, 'OpenAPI 导入')
  const servers = Array.isArray(document.servers) ? document.servers : []
  const serverUrl = text(record(servers[0]).url)
  const globalVariables: HttpKeyValue[] = serverUrl
    ? [{ key: 'baseUrl', value: serverUrl, enabled: true }]
    : []
  const requests: ImportedRequest[] = []
  const methodNames = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'])

  for (const [path, pathValue] of Object.entries(record(document.paths))) {
    const pathItem = record(pathValue)
    const commonParameters = Array.isArray(pathItem.parameters) ? pathItem.parameters : []
    for (const [method, operationValue] of Object.entries(pathItem)) {
      if (!methodNames.has(method.toLocaleLowerCase()))
        continue
      const operation = record(operationValue)
      const operationServers = Array.isArray(operation.servers) ? operation.servers : []
      const operationServer = text(record(operationServers[0]).url)
      const importedUrl = text(operation['x-toolbox-url']) || `${operationServer || (serverUrl ? '{{baseUrl}}' : '')}${path}`
      const request = defaultRequest(text(operation.summary) || text(operation.operationId) || `${method.toUpperCase()} ${path}`, importedUrl)
      request.method = method.toUpperCase()
      request.auth = record(operation['x-toolbox-auth']).type
        ? { ...defaultHttpAuth(), ...record(operation['x-toolbox-auth']) } as HttpAuth
        : openApiSecurity(document, operation)
      request.variables = rows(operation['x-toolbox-variables'])
      request.assertions = normalizeHttpAssertions(operation['x-toolbox-assertions'])

      const parameters = [...commonParameters, ...(Array.isArray(operation.parameters) ? operation.parameters : [])]
      for (const parameterValue of parameters) {
        const parameter = record(parameterValue)
        const target = parameter.in === 'header' ? request.headers : parameter.in === 'query' ? request.query : null
        if (!target)
          continue
        const value = parameter.example ?? openApiExample(record(parameter).schema)
        target.push({ key: text(parameter.name), value: value === '' ? '' : printable(value), enabled: true })
      }

      const content = record(record(operation.requestBody).content)
      const contentEntry = Object.entries(content)[0]
      if (contentEntry) {
        const [contentType, mediaValue] = contentEntry
        const media = record(mediaValue)
        const example = media.example ?? openApiExample(media.schema)
        if (contentType.includes('multipart/form-data')) {
          request.bodyType = 'multipart'
          const properties = record(record(media.schema).properties)
          request.multipart = Object.entries(properties).map(([key, value]) => ({
            id: crypto.randomUUID(),
            kind: record(value).format === 'binary' ? 'file' : 'text',
            name: key,
            value: record(value).format === 'binary' ? '' : printable(openApiExample(value)),
            filePath: '',
            fileName: '',
            contentType: '',
            enabled: true,
          }))
        }
        else {
          request.bodyType = contentType.includes('json') ? 'json' : contentType.includes('x-www-form-urlencoded') ? 'form' : 'text'
          request.body = request.bodyType === 'json' ? JSON.stringify(example, null, 2) : printable(example)
        }
      }
      requests.push(request)
    }
  }
  if (!requests.length)
    throw new Error('OpenAPI 文档中没有可导入的接口')
  return { name, globalVariables, groups: [{ name, requests }] }
}

function printable(value: unknown) {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function openApiBody(request: SavedHttpRequest) {
  if (request.bodyType === 'none')
    return undefined
  if (request.bodyType === 'multipart') {
    return {
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            properties: Object.fromEntries(request.multipart.filter(part => part.enabled).map(part => [part.name, part.kind === 'file'
              ? { type: 'string', format: 'binary' }
              : { type: 'string', example: part.value }])),
          },
        },
      },
    }
  }
  let example: unknown = request.body
  if (request.bodyType === 'json') {
    try {
      example = JSON.parse(request.body)
    }
    catch {
      example = request.body
    }
  }
  const contentType = request.bodyType === 'json'
    ? 'application/json'
    : request.bodyType === 'form' ? 'application/x-www-form-urlencoded' : 'text/plain'
  return { required: true, content: { [contentType]: { schema: { example } } } }
}

export function exportOpenApiCollection(
  collection: HttpCollectionState,
  format: 'json' | 'yaml',
  globalVariables: HttpKeyValue[] = [],
) {
  const paths: JsonRecord = {}
  let serverUrl = globalVariables.find(variable => variable.enabled && variable.key === 'baseUrl')?.value ?? ''
  for (const request of collection.requests) {
    let path = request.url
    try {
      const parsed = new URL(request.url)
      serverUrl ||= parsed.origin
      path = parsed.pathname
    }
    catch {
      path = request.url.replace(/^\{\{baseUrl\}\}/, '') || '/'
    }
    if (!path.startsWith('/'))
      path = `/${path}`
    const pathItem = record(paths[path])
    const parameters = [
      ...request.query.filter(row => row.enabled).map(row => ({ name: row.key, in: 'query', schema: { type: 'string', example: row.value } })),
      ...request.headers.filter(row => row.enabled).map(row => ({ name: row.key, in: 'header', schema: { type: 'string', example: row.value } })),
    ]
    pathItem[request.method.toLocaleLowerCase()] = {
      'summary': request.name,
      'operationId': request.id,
      parameters,
      'requestBody': openApiBody(request),
      'responses': { default: { description: 'Response' } },
      'x-toolbox-url': request.url,
      'x-toolbox-auth': request.auth,
      'x-toolbox-variables': request.variables,
      'x-toolbox-assertions': request.assertions,
    }
    paths[path] = pathItem
  }
  const document = {
    openapi: '3.1.0',
    info: { title: 'Toolbox API Collection', version: '1.0.0' },
    servers: serverUrl ? [{ url: serverUrl }] : undefined,
    paths,
  }
  return format === 'json' ? JSON.stringify(document, null, 2) : stringifyYaml(document)
}

function uniqueGroupName(existing: Set<string>, requested: string) {
  const base = requested.trim() || '导入分组'
  if (!existing.has(base.toLocaleLowerCase())) {
    existing.add(base.toLocaleLowerCase())
    return base
  }
  let number = 2
  while (existing.has(`${base} (${number})`.toLocaleLowerCase()))
    number++
  const value = `${base} (${number})`
  existing.add(value.toLocaleLowerCase())
  return value
}

export function mergeImportedHttpProject(
  collection: HttpCollectionState,
  currentGlobalVariables: HttpKeyValue[],
  project: ImportedHttpProject,
): HttpImportMergeResult {
  const next: HttpCollectionState = {
    version: 3,
    groups: collection.groups.map(group => ({ ...group })),
    requests: collection.requests.map(request => ({
      ...request,
      query: cloneHttpKeyValues(request.query),
      headers: cloneHttpKeyValues(request.headers),
      auth: cloneHttpAuth(request.auth),
      multipart: cloneHttpMultipart(request.multipart),
      variables: cloneHttpKeyValues(request.variables),
      assertions: cloneHttpAssertions(request.assertions),
    })),
  }
  const names = new Set(next.groups.map(group => group.name.toLocaleLowerCase()))
  let requestCount = 0
  for (const importedGroup of project.groups) {
    const group = { id: crypto.randomUUID(), name: uniqueGroupName(names, importedGroup.name), createdAt: Date.now() }
    next.groups.push(group)
    for (const imported of importedGroup.requests) {
      next.requests.push({
        ...imported,
        id: crypto.randomUUID(),
        groupId: group.id,
        query: cloneHttpKeyValues(imported.query),
        headers: cloneHttpKeyValues(imported.headers),
        auth: cloneHttpAuth(imported.auth),
        multipart: cloneHttpMultipart(imported.multipart),
        variables: cloneHttpKeyValues(imported.variables),
        assertions: cloneHttpAssertions(imported.assertions),
        updatedAt: Date.now(),
      })
      requestCount++
    }
  }

  const globalVariables = cloneHttpKeyValues(currentGlobalVariables)
  for (const variable of project.globalVariables) {
    const existing = globalVariables.find(row => row.key.trim() === variable.key.trim())
    if (!existing)
      globalVariables.push({ ...variable })
  }
  return { collection: next, globalVariables, groupCount: project.groups.length, requestCount }
}

export function importHttpProject(input: string, format: HttpImportFormat) {
  if (format === 'curl')
    return importCurl(input)
  if (format === 'postman')
    return importPostmanCollection(input)
  return importOpenApiDocument(input)
}

export function exportHttpProject(
  format: HttpExportFormat,
  request: HttpRequestDraft,
  collection: HttpCollectionState,
  globalVariables: HttpKeyValue[],
) {
  if (format === 'curl')
    return exportRequestAsCurl(request)
  if (format === 'postman')
    return exportPostmanCollection(collection, globalVariables)
  return exportOpenApiCollection(collection, format === 'openapi-json' ? 'json' : 'yaml', globalVariables)
}
