import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { saveQueryResult } from '../../src/infrastructure/save-query-result.js'

function withTempDir(callback: (tempDir: string) => void): void {
  const tempDir = mkdtempSync(join(tmpdir(), 'madar-save-query-result-'))
  try {
    callback(tempDir)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

describe('saveQueryResult', () => {
  test('creates a markdown file with frontmatter and answer body', () => {
    withTempDir((tempDir) => {
      const output = saveQueryResult('what is attention?', 'Attention is softmax.', join(tempDir, 'memory'))
      const content = readFileSync(output, 'utf8')
      expect(content).toContain('question:')
      expect(content).toContain('Attention is softmax.')
      expect(output.endsWith('.md')).toBe(true)
    })
  })

  test('stores query type and capped source nodes', () => {
    withTempDir((tempDir) => {
      const output = saveQueryResult('q', 'a', join(tempDir, 'memory'), {
        queryType: 'path_query',
        sourceNodes: Array.from({ length: 20 }, (_, index) => `Node${index}`),
      })
      const content = readFileSync(output, 'utf8')
      expect(content).toContain('type: "path_query"')
      const line = content.split('\n').find((entry) => entry.startsWith('source_nodes:'))
      expect(line?.match(/"Node/g)?.length ?? 0).toBe(10)
    })
  })
})
