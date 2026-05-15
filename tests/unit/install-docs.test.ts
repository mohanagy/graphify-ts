import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('install documentation', () => {
  it('documents Aider and OpenCode install artifacts and context-pack-first workflow', () => {
    const readme = readFileSync(resolve('README.md'), 'utf8')

    expect(readme).toContain('| Aider | AGENTS.md context-pack-first profile | `graphify-ts aider install` |')
    expect(readme).toContain(
      '| OpenCode | AGENTS.md + `.opencode/plugins/graphify-ts.js` + MCP via `opencode.json` / `opencode.jsonc` | `graphify-ts opencode install` |',
    )
    expect(readme).toContain('Aider and OpenCode are intentionally context-pack-first')
    expect(readme).toContain('graphify-ts pack "<task>" --task explain')
    expect(readme).toContain('graphify-ts aider uninstall')
    expect(readme).toContain('graphify-ts opencode uninstall')
  })

  it('documents the strict MCP install profile for claude, cursor, copilot, and gemini', () => {
    const readme = readFileSync(resolve('README.md'), 'utf8')

    expect(readme).toContain('claude <install|uninstall> [--profile core|full|strict]')
    expect(readme).toContain('cursor <install|uninstall> [--profile core|full|strict]')
    expect(readme).toContain('copilot <install|uninstall> [--profile core|full|strict]')
    expect(readme).toContain('gemini <install|uninstall> [--profile core|full|strict]')
    expect(readme).toContain('`--profile strict` keeps the lean core MCP tool surface')
    expect(readme).toContain('call `context_pack` once for the task before broader exploration')
  })
})
