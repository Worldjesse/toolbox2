import { describe, expect, it } from 'vitest'
import { toolCategories, toolRegistry } from './registry'

describe('tool registry', () => {
  it('keeps ids, paths and route names unique', () => {
    expect(new Set(toolRegistry.map(tool => tool.id)).size).toBe(toolRegistry.length)
    expect(new Set(toolRegistry.map(tool => tool.path)).size).toBe(toolRegistry.length)
    expect(toolRegistry.every(tool => tool.path === `/tools/${tool.id}`)).toBe(true)
  })

  it('uses registered categories and searchable metadata', () => {
    const categories = new Set(toolCategories.map(category => category.id))
    expect(toolRegistry.every(tool => categories.has(tool.category))).toBe(true)
    expect(toolRegistry.every(tool => tool.keywords.length > 0 && tool.icon.length > 0)).toBe(true)
  })
})
