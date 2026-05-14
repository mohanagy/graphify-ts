import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

import { describe, expect, test } from 'vitest'

import { runDoctorCommand, runStatusCommand } from '../../src/infrastructure/doctor.js'

function withSandbox(run: (sandboxDir: string) => void): void {
  const sandboxDir = mkdtempSync(join(tmpdir(), 'graphify-ts-doctor-'))
  try {
    run(sandboxDir)
  } finally {
    rmSync(sandboxDir, { recursive: true, force: true })
  }
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function writeText(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, 'utf8')
}

function writeMcpServer(path: string, serversKey: 'mcpServers' | 'servers', graphPath: string): void {
  writeJson(path, {
    [serversKey]: {
      graphify: {
        command: 'npx',
        args: ['--yes', '@mohammednagy/graphify-ts', 'serve', '--stdio', graphPath],
      },
    },
  })
}

describe('doctor command', () => {
  test('reports missing graph and suggests setup commands', () => {
    withSandbox((sandboxDir) => {
      const output = runDoctorCommand({
        projectDir: sandboxDir,
        now: Date.now(),
      })

      expect(output).toContain('[graphify doctor] attention needed')
      expect(output).toContain('graph: missing')
      expect(output).toContain('graphify-ts generate .')
      expect(output).toContain('graphify-ts claude install')
      expect(output).toContain('graphify-ts cursor install')
      expect(output).toContain('graphify-ts gemini install')
      expect(output).toContain('graphify-ts copilot install')
    })
  })

  test('reports healthy status when graph and configs are wired', () => {
    withSandbox((sandboxDir) => {
      const graphPath = resolve(sandboxDir, 'graphify-out', 'graph.json')
      writeText(graphPath, '{"nodes":[],"edges":[]}\n')
      writeText(resolve(sandboxDir, 'CLAUDE.md'), '## graphify-ts\n')
      writeText(resolve(sandboxDir, 'GEMINI.md'), '## graphify-ts\n')
      writeText(resolve(sandboxDir, '.cursor', 'rules', 'graphify-ts.mdc'), 'rule')
      writeJson(resolve(sandboxDir, '.claude', 'settings.json'), {
        hooks: {
          PreToolUse: [{ matcher: 'Read', hooks: [{ type: 'command', command: 'graphify-out' }] }],
        },
      })
      writeJson(resolve(sandboxDir, '.gemini', 'settings.json'), {
        hooks: {
          BeforeTool: [{ matcher: 'read_file', hooks: [{ type: 'command', command: 'graphify-out' }] }],
        },
      })
      writeMcpServer(resolve(sandboxDir, '.mcp.json'), 'mcpServers', graphPath)
      writeMcpServer(resolve(sandboxDir, '.cursor', 'mcp.json'), 'mcpServers', graphPath)
      writeMcpServer(resolve(sandboxDir, '.vscode', 'mcp.json'), 'servers', graphPath)

      const doctor = runDoctorCommand({
        projectDir: sandboxDir,
        now: Date.now(),
      })
      const status = runStatusCommand({
        projectDir: sandboxDir,
        now: Date.now(),
      })

      expect(doctor).toContain('[graphify doctor] healthy')
      expect(doctor).toContain('claude: configured')
      expect(doctor).toContain('cursor: configured')
      expect(doctor).toContain('gemini: configured')
      expect(doctor).toContain('copilot: configured')
      expect(doctor).toContain('next commands: none')

      expect(status).toContain('[graphify status] healthy')
      expect(status).toContain('next none')
    })
  })

  test('flags stale mcp path and recommends reinstall', () => {
    withSandbox((sandboxDir) => {
      const graphPath = resolve(sandboxDir, 'graphify-out', 'graph.json')
      const wrongGraphPath = resolve(sandboxDir, 'graphify-out', 'old-graph.json')
      writeText(graphPath, '{"nodes":[],"edges":[]}\n')
      writeText(resolve(sandboxDir, 'CLAUDE.md'), '## graphify-ts\n')
      writeJson(resolve(sandboxDir, '.claude', 'settings.json'), {
        hooks: {
          PreToolUse: [{ matcher: 'Read', hooks: [{ type: 'command', command: 'graphify-out' }] }],
        },
      })
      writeMcpServer(resolve(sandboxDir, '.mcp.json'), 'mcpServers', wrongGraphPath)

      const output = runDoctorCommand({
        projectDir: sandboxDir,
        now: Date.now(),
      })

      expect(output).toContain('claude: partial')
      expect(output).toContain('.mcp.json')
      expect(output).toContain('stale')
      expect(output).toContain('graphify-ts claude install')
    })
  })
})
