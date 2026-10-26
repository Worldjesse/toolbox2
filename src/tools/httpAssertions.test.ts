import { describe, expect, it } from 'vitest'
import { evaluateHttpAssertions, normalizeHttpAssertions } from './httpAssertions'

const response = {
  status: 201,
  durationMs: 48,
  headers: [
    { key: 'Content-Type', value: 'application/json; charset=utf-8', enabled: true },
    { key: 'X-Request-Id', value: 'req-123', enabled: true },
  ],
  body: JSON.stringify({ data: { id: 42, tags: ['ready'] }, success: true }),
}

describe('http assertions', () => {
  it('evaluates status, duration, headers, body and JSON paths', () => {
    const results = evaluateHttpAssertions([
      { id: '1', type: 'status-equals', target: '', expected: '201', enabled: true },
      { id: '2', type: 'duration-less-than', target: '', expected: '100', enabled: true },
      { id: '3', type: 'header-exists', target: 'x-request-id', expected: '', enabled: true },
      { id: '4', type: 'header-contains', target: 'Content-Type', expected: 'json', enabled: true },
      { id: '5', type: 'body-contains', target: '', expected: 'success', enabled: true },
      { id: '6', type: 'json-path-exists', target: '$.data.tags[0]', expected: '', enabled: true },
      { id: '7', type: 'json-path-equals', target: 'data.id', expected: '42', enabled: true },
    ], response)

    expect(results).toHaveLength(7)
    expect(results.every(result => result.passed)).toBe(true)
  })

  it('reports failed and malformed assertions without throwing', () => {
    const results = evaluateHttpAssertions([
      { id: '1', type: 'json-path-equals', target: '$.missing', expected: 'yes', enabled: true },
      { id: '2', type: 'duration-less-than', target: '', expected: 'bad', enabled: true },
      { id: '3', type: 'status-equals', target: '', expected: '200', enabled: false },
    ], response)

    expect(results).toHaveLength(2)
    expect(results.every(result => !result.passed)).toBe(true)
    expect(results[0].actual).toBe('不存在')
  })

  it('normalizes persisted assertion data', () => {
    expect(normalizeHttpAssertions([
      { type: 'header-equals', target: 'etag', expected: 'abc' },
      { type: 'unknown', expected: 200, enabled: false },
    ])).toMatchObject([
      { type: 'header-equals', target: 'etag', expected: 'abc', enabled: true },
      { type: 'status-equals', target: '', expected: '', enabled: false },
    ])
  })
})
