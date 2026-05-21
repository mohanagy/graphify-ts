import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const PRIMARY_PACKAGE_NAME = 'madar'
export const LEGACY_PACKAGE_NAME = '@mohammednagy/graphify-ts'
export const LEGACY_BIN_NAME = 'graphify-ts'

type PrepareLegacyCompatPackageOptions = {
  licenseText?: string
  outDir: string
  version: string
}

function legacyCompatReadme(version: string): string {
  return [
    '# @mohammednagy/graphify-ts',
    '',
    'Compatibility package for the Madar rename.',
    '',
    `This package keeps the legacy \`${LEGACY_BIN_NAME}\` CLI working by delegating to \`${PRIMARY_PACKAGE_NAME}@${version}\`.`,
    '',
    'New installs should prefer `madar` directly.',
    '',
  ].join('\n')
}

function legacyCompatWrapperContent(): string {
  return [
    '#!/usr/bin/env node',
    "import { dirname, resolve } from 'node:path'",
    "import { fileURLToPath, pathToFileURL } from 'node:url'",
    '',
    'const here = dirname(fileURLToPath(import.meta.url))',
    `const target = resolve(here, '../node_modules/${PRIMARY_PACKAGE_NAME}/dist/src/cli/bin.js')`,
    'await import(pathToFileURL(target).href)',
    '',
  ].join('\n')
}

export function prepareLegacyCompatPackage(options: PrepareLegacyCompatPackageOptions): void {
  const { licenseText, outDir, version } = options
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(join(outDir, 'bin'), { recursive: true })

  const manifest = {
    name: LEGACY_PACKAGE_NAME,
    version,
    description: 'Compatibility wrapper package that keeps the legacy graphify-ts CLI working during the Madar migration.',
    license: 'MIT',
    author: 'mohanagy',
    type: 'module',
    publishConfig: {
      access: 'public',
    },
    repository: {
      type: 'git',
      url: 'git+https://github.com/mohanagy/madar.git',
    },
    bugs: {
      url: 'https://github.com/mohanagy/madar/issues',
    },
    homepage: 'https://github.com/mohanagy/madar#readme',
    bin: {
      [LEGACY_BIN_NAME]: 'bin/graphify-ts.js',
    },
    files: [
      'bin/',
      'README.md',
      'LICENSE',
    ],
    dependencies: {
      [PRIMARY_PACKAGE_NAME]: version,
    },
  }

  writeFileSync(join(outDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  writeFileSync(join(outDir, 'README.md'), legacyCompatReadme(version), 'utf8')
  writeFileSync(join(outDir, 'LICENSE'), licenseText ?? 'MIT\n', 'utf8')
  writeFileSync(join(outDir, 'bin', 'graphify-ts.js'), legacyCompatWrapperContent(), { encoding: 'utf8', mode: 0o755 })
}
