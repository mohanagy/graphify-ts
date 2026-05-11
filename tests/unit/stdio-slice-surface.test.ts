import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { handleStdioRequest } from '../../src/runtime/stdio-server.js'

const tempRoots: string[] = []
let previousToolProfile: string | undefined

function createGraphPath(): string {
  const root = mkdtempSync(join(tmpdir(), 'graphify-stdio-slice-'))
  tempRoots.push(root)
  const graphifyOut = join(root, 'graphify-out')
  const graphPath = join(graphifyOut, 'graph.json')
  mkdirSync(graphifyOut, { recursive: true })
  writeFileSync(join(root, 'auth.ts'), 'export function login() {}\n', 'utf8')
  writeFileSync(join(root, 'auth.spec.ts'), 'test("login", () => {})\n', 'utf8')
  writeFileSync(join(graphifyOut, 'GRAPH_REPORT.md'), '# Graph report\n', 'utf8')
  writeFileSync(graphPath, JSON.stringify({
    root_path: root,
    nodes: [
      { id: 'auth_service', label: 'AuthService.login', source_file: join(root, 'auth.ts'), source_location: 'L1', file_type: 'code', community: 0 },
      { id: 'auth_test', label: 'AuthService.login.spec', source_file: join(root, 'auth.spec.ts'), source_location: 'L2', file_type: 'code', community: 1 },
    ],
    edges: [
      { source: 'auth_service', target: 'auth_test', relation: 'covered_by', confidence: 'EXTRACTED', source_file: join(root, 'auth.ts') },
    ],
    hyperedges: [],
  }), 'utf8')
  return graphPath
}

afterEach(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop()!, { recursive: true, force: true })
  }
})

beforeEach(() => {
  previousToolProfile = process.env.GRAPHIFY_TOOL_PROFILE
  process.env.GRAPHIFY_TOOL_PROFILE = 'full'
})

afterEach(() => {
  if (previousToolProfile === undefined) {
    delete process.env.GRAPHIFY_TOOL_PROFILE
  } else {
    process.env.GRAPHIFY_TOOL_PROFILE = previousToolProfile
  }
})

describe('stdio slice-v1 surface', () => {
  it('accepts retrieval_strategy=slice-v1 for retrieve and context_pack', async () => {
    const graphPath = createGraphPath()

    const retrieveResponse = await Promise.resolve(handleStdioRequest(graphPath, {
      id: 1,
      method: 'tools/call',
      params: {
        name: 'retrieve',
        arguments: {
          question: 'Explain `AuthService.login`',
          budget: 1000,
          retrieval_strategy: 'slice-v1',
          verbose: true,
        },
      },
    }))

    const contextPackResponse = await Promise.resolve(handleStdioRequest(graphPath, {
      id: 2,
      method: 'tools/call',
      params: {
        name: 'context_pack',
        arguments: {
          prompt: 'Explain `AuthService.login`',
          budget: 1000,
          task: 'explain',
          retrieval_strategy: 'slice-v1',
          verbose: true,
        },
      },
    }))

    const retrieveText = ((retrieveResponse as { result?: { content?: Array<{ text: string }> } }).result?.content ?? [])[0]?.text ?? ''
    const contextPackText = ((contextPackResponse as { result?: { content?: Array<{ text: string }> } }).result?.content ?? [])[0]?.text ?? ''

    expect(retrieveText).toContain('"retrieval_strategy":"slice-v1"')
    expect(contextPackText).toContain('"retrieval_strategy":"slice-v1"')
  })

  it('rejects unsupported retrieval_strategy values', async () => {
    const graphPath = createGraphPath()

    const retrieveResponse = await Promise.resolve(handleStdioRequest(graphPath, {
      id: 1,
      method: 'tools/call',
      params: {
        name: 'retrieve',
        arguments: {
          question: 'Explain auth',
          budget: 1000,
          retrieval_strategy: 'invented',
        },
      },
    }))

    const contextPackResponse = await Promise.resolve(handleStdioRequest(graphPath, {
      id: 2,
      method: 'tools/call',
      params: {
        name: 'context_pack',
        arguments: {
          prompt: 'Explain auth',
          budget: 1000,
          task: 'explain',
          retrieval_strategy: 'invented',
        },
      },
    }))

    expect(JSON.stringify(retrieveResponse)).toContain('retrieval_strategy must be one of default, slice-v1')
    expect(JSON.stringify(contextPackResponse)).toContain('retrieval_strategy must be one of default, slice-v1')
  })

  it('rejects retrieval_strategy for review context packs instead of ignoring it', async () => {
    const graphPath = createGraphPath()

    const contextPackResponse = await Promise.resolve(handleStdioRequest(graphPath, {
      id: 3,
      method: 'tools/call',
      params: {
        name: 'context_pack',
        arguments: {
          prompt: 'Review current diff',
          budget: 1000,
          task: 'review',
          retrieval_strategy: 'slice-v1',
        },
      },
    }))

    expect(JSON.stringify(contextPackResponse)).toContain('retrieval_strategy is not supported for task=review')
  })
})
