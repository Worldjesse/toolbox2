import { describe, expect, it } from 'vitest'
import { buildHttpAiContext, httpAiExportFilename } from './httpAiExport'

describe('http AI context export', () => {
  it('exports the complete call context and redacts secrets', () => {
    const markdown = buildHttpAiContext({
      evidence: {
        testDate: '2026-10-07',
        environment: 'project3',
        service: 'api-oms',
        commitId: '9dfbf453c2e03a12486234303b2a6804d3f059d2',
        notes: 'OFF_USE response includes 8851 and excludes 44.',
      },
      method: 'POST',
      url: 'https://api.example.com/users?access_token=url-secret&page=1',
      timeoutMs: 30000,
      query: [{ key: 'apiKey', value: 'query-secret', enabled: true }],
      requestHeaders: [
        { key: 'Authorization', value: 'Bearer header-secret', enabled: true },
        { key: 'Accept', value: 'application/json', enabled: true },
      ],
      bodyType: 'json',
      requestBody: '{"username":"jesse","password":"body-secret"}',
      response: {
        status: 200,
        statusText: 'OK',
        headers: [{ key: 'Set-Cookie', value: 'session=response-secret', enabled: true }],
        body: '{"data":{"token":"response-token","id":1}}',
        durationMs: 24,
        sizeBytes: 162,
        finalUrl: 'https://api.example.com/users?access_token=url-secret&page=1',
        truncated: false,
      },
      exportedAt: '2026-10-07T03:00:00.000Z',
    })

    expect(markdown).toContain('# HTTP Integration Evidence')
    expect(markdown).toContain('- Test date: 2026-10-07')
    expect(markdown).toContain('- Deployment environment: project3')
    expect(markdown).toContain('- Service / repository: api-oms')
    expect(markdown).toContain('- Deployment commit: 9dfbf453c2e03a12486234303b2a6804d3f059d2')
    expect(markdown).toContain('Real login token was used; the token value is intentionally omitted.')
    expect(markdown).toContain('OFF_USE response includes 8851 and excludes 44.')
    expect(markdown).toContain('- Status: 200 OK')
    expect(markdown).toContain('"username": "jesse"')
    expect(markdown).toContain('[REDACTED]')
    expect(markdown).not.toContain('url-secret')
    expect(markdown).not.toContain('header-secret')
    expect(markdown).not.toContain('body-secret')
    expect(markdown).not.toContain('response-token')
    expect(markdown).not.toContain('response-secret')
  })

  it('creates a filesystem-safe markdown filename', () => {
    expect(httpAiExportFilename('https://api.example.com/oms/User/GetUserStoreList?x=1'))
      .toMatch(/^http-GetUserStoreList-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.md$/)
  })

  it('redacts secrets from form, text, and incomplete URL values', () => {
    const baseInput = {
      evidence: {
        testDate: '2026-10-07',
        environment: 'project3',
        service: 'api-oms',
        commitId: 'commit-id',
        notes: '',
      },
      method: 'POST',
      url: '/users?access_token=url-secret&page=1',
      timeoutMs: 30000,
      query: [],
      requestHeaders: [],
      response: {
        status: 200,
        statusText: 'OK',
        headers: [],
        body: 'token=response-secret, result=ok',
        durationMs: 1,
        sizeBytes: 1,
        finalUrl: '/users?api_key=final-secret&page=1',
        truncated: false,
      },
      exportedAt: '2026-10-07T03:00:00.000Z',
    }

    const formMarkdown = buildHttpAiContext({
      ...baseInput,
      bodyType: 'form',
      requestBody: 'username=jesse&password=form-secret',
    })
    expect(formMarkdown).not.toContain('url-secret')
    expect(formMarkdown).not.toContain('final-secret')
    expect(formMarkdown).not.toContain('form-secret')
    expect(formMarkdown).not.toContain('response-secret')
    expect(formMarkdown).toContain('[REDACTED]')
  })
})
