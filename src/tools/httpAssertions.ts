import type { HttpKeyValue } from './httpCollections'

export type HttpAssertionType
  = | 'status-equals'
    | 'duration-less-than'
    | 'header-exists'
    | 'header-equals'
    | 'header-contains'
    | 'body-contains'
    | 'json-path-exists'
    | 'json-path-equals'

export interface HttpAssertion {
  id: string
  type: HttpAssertionType
  target: string
  expected: string
  enabled: boolean
}

export interface HttpAssertionResponse {
  status: number
  durationMs: number
  headers: HttpKeyValue[]
  body: string
}

export interface HttpAssertionResult {
  id: string
  type: HttpAssertionType
  passed: boolean
  label: string
  actual: string
  message: string
}

export const HTTP_ASSERTION_LABELS: Record<HttpAssertionType, string> = {
  'status-equals': '状态码等于',
  'duration-less-than': '响应时间小于',
  'header-exists': '响应头存在',
  'header-equals': '响应头等于',
  'header-contains': '响应头包含',
  'body-contains': 'Body 包含',
  'json-path-exists': 'JSON Path 存在',
  'json-path-equals': 'JSON Path 等于',
}

const assertionTypes = Object.keys(HTTP_ASSERTION_LABELS) as HttpAssertionType[]

export function emptyHttpAssertion(type: HttpAssertionType = 'status-equals'): HttpAssertion {
  return {
    id: crypto.randomUUID(),
    type,
    target: '',
    expected: type === 'status-equals' ? '200' : '',
    enabled: true,
  }
}

export function cloneHttpAssertions(assertions: HttpAssertion[]): HttpAssertion[] {
  return assertions.map(assertion => ({ ...assertion }))
}

export function normalizeHttpAssertions(value: unknown): HttpAssertion[] {
  if (!Array.isArray(value))
    return []
  return value.filter(item => item && typeof item === 'object').map((item) => {
    const source = item as Partial<HttpAssertion>
    const type = assertionTypes.includes(source.type as HttpAssertionType)
      ? source.type as HttpAssertionType
      : 'status-equals'
    return {
      id: typeof source.id === 'string' ? source.id : crypto.randomUUID(),
      type,
      target: typeof source.target === 'string' ? source.target : '',
      expected: typeof source.expected === 'string' ? source.expected : '',
      enabled: source.enabled !== false,
    }
  })
}

function headerValues(headers: HttpKeyValue[], name: string) {
  const normalized = name.trim().toLocaleLowerCase()
  return headers
    .filter(header => header.key.trim().toLocaleLowerCase() === normalized)
    .map(header => header.value)
}

function tokenizeJsonPath(path: string): Array<string | number> | null {
  const source = path.trim().replace(/^\$\.?/, '')
  if (!source)
    return []

  const tokens: Array<string | number> = []
  const pattern = /(?:^|\.)([^.[\]]+)|\[(\d+)\]|\[['"]([^'"]+)['"]\]/g
  let consumed = 0
  let match = pattern.exec(source)
  while (match) {
    if (match.index !== consumed)
      return null
    tokens.push(match[1] ?? match[3] ?? Number(match[2]))
    consumed = pattern.lastIndex
    match = pattern.exec(source)
  }
  return consumed === source.length ? tokens : null
}

function valueAtJsonPath(body: string, path: string): { exists: boolean, value?: unknown } {
  let root: unknown
  try {
    root = JSON.parse(body)
  }
  catch {
    return { exists: false }
  }
  const tokens = tokenizeJsonPath(path)
  if (!tokens)
    return { exists: false }
  let value = root
  for (const token of tokens) {
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, token))
      return { exists: false }
    value = (value as Record<string | number, unknown>)[token]
  }
  return { exists: true, value }
}

function printable(value: unknown) {
  if (typeof value === 'string')
    return value
  if (value === undefined)
    return 'undefined'
  try {
    return JSON.stringify(value)
  }
  catch {
    return String(value)
  }
}

function expectedValue(value: string): unknown {
  try {
    return JSON.parse(value)
  }
  catch {
    return value
  }
}

function sameValue(actual: unknown, expected: string) {
  return printable(actual) === printable(expectedValue(expected))
}

export function evaluateHttpAssertions(assertions: HttpAssertion[], response: HttpAssertionResponse): HttpAssertionResult[] {
  return assertions.filter(assertion => assertion.enabled).map((assertion) => {
    let passed = false
    let actual = ''
    let expectation = assertion.expected

    switch (assertion.type) {
      case 'status-equals':
        actual = String(response.status)
        passed = response.status === Number(assertion.expected)
        break
      case 'duration-less-than':
        actual = `${response.durationMs} ms`
        expectation = `${assertion.expected} ms`
        passed = response.durationMs < Number(assertion.expected)
        break
      case 'header-exists': {
        const values = headerValues(response.headers, assertion.target)
        actual = values.join(', ') || '不存在'
        expectation = assertion.target
        passed = values.length > 0
        break
      }
      case 'header-equals': {
        const values = headerValues(response.headers, assertion.target)
        actual = values.join(', ') || '不存在'
        passed = values.includes(assertion.expected)
        break
      }
      case 'header-contains': {
        const values = headerValues(response.headers, assertion.target)
        actual = values.join(', ') || '不存在'
        passed = values.some(value => value.includes(assertion.expected))
        break
      }
      case 'body-contains':
        actual = response.body.length > 120 ? `${response.body.slice(0, 120)}...` : response.body
        passed = response.body.includes(assertion.expected)
        break
      case 'json-path-exists': {
        const result = valueAtJsonPath(response.body, assertion.target)
        actual = result.exists ? printable(result.value) : '不存在'
        expectation = assertion.target
        passed = result.exists
        break
      }
      case 'json-path-equals': {
        const result = valueAtJsonPath(response.body, assertion.target)
        actual = result.exists ? printable(result.value) : '不存在'
        passed = result.exists && sameValue(result.value, assertion.expected)
        break
      }
    }

    const label = HTTP_ASSERTION_LABELS[assertion.type]
    return {
      id: assertion.id,
      type: assertion.type,
      passed,
      label,
      actual,
      message: passed
        ? `${label}：通过`
        : `${label}：期望 ${expectation || '有效值'}，实际 ${actual || '空值'}`,
    }
  })
}
