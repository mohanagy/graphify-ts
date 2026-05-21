import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { prepareLegacyCompatPackage } from '../../src/infrastructure/compat-package.js'

function withTempDir(run: (tempDir: string) => void): void {
  const tempDir = mkdtempSync(join(tmpdir(), 'madar-compat-'))
  try {
    run(tempDir)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

describe('legacy npm compatibility package', () => {
  it('writes a publishable @mohammednagy/graphify-ts compatibility package that depends on madar', () => {
    withTempDir((tempDir) => {
      prepareLegacyCompatPackage({
        outDir: tempDir,
        version: '1.2.3',
      })

      const manifest = JSON.parse(readFileSync(join(tempDir, 'package.json'), 'utf8')) as {
        name?: string
        version?: string
        dependencies?: Record<string, string>
        bin?: Record<string, string>
      }
      const wrapper = readFileSync(join(tempDir, 'bin', 'graphify-ts.js'), 'utf8')

      expect(manifest.name).toBe('@mohammednagy/graphify-ts')
      expect(manifest.version).toBe('1.2.3')
      expect(manifest.dependencies).toEqual({ madar: '1.2.3' })
      expect(manifest.bin).toEqual({ 'graphify-ts': 'bin/graphify-ts.js' })
      expect(wrapper).toContain("node_modules/madar/dist/src/cli/bin.js")
    })
  })
})
