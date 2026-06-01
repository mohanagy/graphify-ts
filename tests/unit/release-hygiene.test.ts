import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

interface PackageManifest {
  scripts?: Record<string, string>
}

function loadFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

function loadPackageManifest(): PackageManifest {
  return JSON.parse(loadFile('package.json')) as PackageManifest
}

function releaseVerifyScriptPath(): string {
  return join(process.cwd(), '.github/scripts/verify-release-hygiene.mjs')
}

function collectMarkdownLinkTargets(markdown: string): string[] {
  return [...markdown.matchAll(/\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((match) => match[1] ?? '')
}

describe('release hygiene', () => {
  it('keeps npm-visible README links stable', () => {
    const readme = loadFile('README.md')
    const unstableTargets = collectMarkdownLinkTargets(readme).filter(
      (target) => target.length > 0 && !/^(https?:\/\/|mailto:|#)/.test(target),
    )

    expect(unstableTargets).toEqual([])
  })

  it('ships a dedicated release verification command', () => {
    const scripts = loadPackageManifest().scripts ?? {}

    expect(scripts['release:verify']).toBe('node .github/scripts/verify-release-hygiene.mjs')
    expect(scripts['publish:next']).toBe('npm publish --tag next --access public')
    expect(() =>
      execFileSync(process.execPath, [releaseVerifyScriptPath()], {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: 'pipe',
      }),
    ).not.toThrow()
  })

  it('requires the README changelog link to match the current release heading exactly', () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'madar-release-hygiene-'))

    try {
      writeFileSync(
        join(fixtureDir, 'package.json'),
        JSON.stringify(
          {
            name: '@lubab/madar',
            version: '0.27.4',
            repository: {
              type: 'git',
              url: 'git+https://github.com/mohanagy/madar.git',
            },
            bugs: {
              url: 'https://github.com/mohanagy/madar/issues',
            },
            homepage: 'https://github.com/mohanagy/madar#readme',
          },
          null,
          2,
        ),
      )
      writeFileSync(
        join(fixtureDir, 'README.md'),
        '[release notes](https://github.com/mohanagy/madar/blob/main/CHANGELOG.md#0274---wrong-date)\n',
      )
      writeFileSync(join(fixtureDir, 'CHANGELOG.md'), '## [0.27.4] - 2026-05-29\n')

      expect(() =>
        execFileSync(process.execPath, [releaseVerifyScriptPath()], {
          cwd: fixtureDir,
          encoding: 'utf8',
          stdio: 'pipe',
        }),
      ).toThrow(/matching changelog entry/)
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true })
    }
  })

  it('documents the release verification command in the release checklist', () => {
    const releaseDoc = loadFile('docs/release.md')

    expect(releaseDoc).toContain('npm run release:verify')
    expect(releaseDoc).toContain('`main` for stable releases, `next` for prereleases')
    expect(releaseDoc).toContain('npm publish --tag next --access public --provenance')
  })

  it('requires prerelease README changelog links to target next', () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'madar-release-hygiene-prerelease-'))

    try {
      writeFileSync(
        join(fixtureDir, 'package.json'),
        JSON.stringify(
          {
            name: '@lubab/madar',
            version: '0.27.7-next.0',
            repository: {
              type: 'git',
              url: 'git+https://github.com/mohanagy/madar.git',
            },
            bugs: {
              url: 'https://github.com/mohanagy/madar/issues',
            },
            homepage: 'https://github.com/mohanagy/madar#readme',
          },
          null,
          2,
        ),
      )
      writeFileSync(
        join(fixtureDir, 'README.md'),
        '[release notes](https://github.com/mohanagy/madar/blob/main/CHANGELOG.md#0277-next0---2026-06-01)\n',
      )
      writeFileSync(join(fixtureDir, 'CHANGELOG.md'), '## [0.27.7-next.0] - 2026-06-01\n')

      expect(() =>
        execFileSync(process.execPath, [releaseVerifyScriptPath()], {
          cwd: fixtureDir,
          encoding: 'utf8',
          stdio: 'pipe',
        }),
      ).toThrow(/matching changelog entry/)
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true })
    }
  })
})
