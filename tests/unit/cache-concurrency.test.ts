import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

function createTempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'madar-cache-concurrency-'))
}

describe('cache concurrent writes', () => {
  const tempRoots: string[] = []

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    vi.doUnmock('node:fs')
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('keeps nested writes to the same cache entry from colliding on one temp path', async () => {
    const root = createTempRoot()
    tempRoots.push(root)
    const filePath = join(root, 'sample.txt')
    writeFileSync(filePath, 'hello world', 'utf8')

    let injectNestedWrite = true
    let nestedSaveCached: ((filePath: string, result: Record<string, unknown>, root?: string) => void) | null = null

    vi.doMock('node:fs', async () => {
      const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
      return {
        ...actual,
        renameSync(source: string, destination: string): void {
          if (injectNestedWrite && source.endsWith('.tmp')) {
            injectNestedWrite = false
            nestedSaveCached?.(filePath, { nodes: [{ id: 'inner' }], edges: [] }, root)
          }
          actual.renameSync(source, destination)
        },
      }
    })

    const cache = await import('../../src/infrastructure/cache.js')
    nestedSaveCached = cache.saveCached

    expect(() => cache.saveCached(filePath, { nodes: [{ id: 'outer' }], edges: [] }, root)).not.toThrow()
    expect(cache.loadCached(filePath, root)).toEqual({
      nodes: [{ id: 'outer' }],
      edges: [],
    })
  })
})
