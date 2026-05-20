import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildSpi } from '../../src/pipeline/spi/build.js'
import type { SemanticProgramIndex, SpiSymbol, SpiSymbolKind } from '../../src/pipeline/spi/types.js'

const FROZEN_NOW = () => new Date('2026-05-14T00:00:00.000Z')

function mkSandbox(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

function writeFile(root: string, rel: string, content: string): void {
  const abs = join(root, rel)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, content, 'utf8')
}

function build(root: string): SemanticProgramIndex {
  return buildSpi({
    root,
    graphifyVersion: 'test-0.0.0',
    extractorVersion: 'spi-v1.0.0-storage-semantics',
    now: FROZEN_NOW,
  })
}

function findSymbol(
  spi: SemanticProgramIndex,
  path: string,
  name: string,
  kind: SpiSymbolKind,
): SpiSymbol | undefined {
  const file = spi.files.find((entry) => entry.path === path)
  if (!file) return undefined
  return spi.symbols.find((entry) => entry.file_id === file.id && entry.name === name && entry.kind === kind)
}

function findStorageTaggedSymbol(
  spi: SemanticProgramIndex,
  path: string,
  expected: {
    operation: string
    candidateNames: string[]
  },
): SpiSymbol | undefined {
  const file = spi.files.find((entry) => entry.path === path)
  if (!file) return undefined

  const symbols = spi.symbols.filter((entry) => entry.file_id === file.id)
  return symbols.find((entry) =>
    entry.framework_metadata?.storage_operation === expected.operation
    && expected.candidateNames.some((name) =>
      entry.name === name
      || entry.name.endsWith(`.${name}`)
      || entry.name.endsWith(name)))
}

function expectStorageOperation(
  symbol: SpiSymbol | undefined,
  expected: {
    role?: string | RegExp
    operation: string
  },
): void {
  expect(symbol).toBeDefined()
  if (expected.role instanceof RegExp) {
    expect(String(symbol?.framework_role ?? '')).toMatch(expected.role)
  } else if (typeof expected.role === 'string') {
    expect(symbol?.framework_role).toBe(expected.role)
  } else {
    expect(symbol?.framework_role).toBeDefined()
  }
  expect(symbol?.framework_metadata?.storage_operation).toBe(expected.operation)
}

describe('SPI storage operation semantics regressions (#185)', () => {
  let sandbox: string

  beforeEach(() => {
    sandbox = mkSandbox('spi-storage-semantics-')
  })

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true })
  })

  it('tags Prisma model access wrappers with storage operation metadata', () => {
    writeFile(sandbox, 'src/db.ts', [
      'import { PrismaClient } from "@prisma/client"',
      'export const prisma = new PrismaClient()',
      'export async function findUserById(id: string) {',
      '  return prisma.user.findUnique({ where: { id } })',
      '}',
      'export async function listUsers() {',
      '  return prisma.user.findMany()',
      '}',
      'export async function createUser(email: string) {',
      '  return prisma.user.create({ data: { email } })',
      '}',
      'export async function updateUser(id: string, email: string) {',
      '  return prisma.user.update({ where: { id }, data: { email } })',
      '}',
      'export async function upsertUser(id: string, email: string) {',
      '  return prisma.user.upsert({',
      '    where: { id },',
      '    update: { email },',
      '    create: { id, email },',
      '  })',
      '}',
      'export async function persistUsersInTransaction(email: string) {',
      '  return prisma.$transaction([',
      '    prisma.user.create({ data: { email } }),',
      '    prisma.user.findMany(),',
      '  ])',
      '}',
    ].join('\n') + '\n')

    const spi = build(sandbox)

    expectStorageOperation(findStorageTaggedSymbol(spi, 'src/db.ts', {
      operation: 'findUnique',
      candidateNames: ['findUserById', 'findUnique'],
    }), { role: /^prisma_/, operation: 'findUnique' })
    expectStorageOperation(findStorageTaggedSymbol(spi, 'src/db.ts', {
      operation: 'findMany',
      candidateNames: ['listUsers', 'findMany'],
    }), { role: /^prisma_/, operation: 'findMany' })
    expectStorageOperation(findStorageTaggedSymbol(spi, 'src/db.ts', {
      operation: 'create',
      candidateNames: ['createUser', 'create'],
    }), { role: /^prisma_/, operation: 'create' })
    expectStorageOperation(findStorageTaggedSymbol(spi, 'src/db.ts', {
      operation: 'update',
      candidateNames: ['updateUser', 'update'],
    }), { role: /^prisma_/, operation: 'update' })
    expectStorageOperation(findStorageTaggedSymbol(spi, 'src/db.ts', {
      operation: 'upsert',
      candidateNames: ['upsertUser', 'upsert'],
    }), { role: /^prisma_/, operation: 'upsert' })
    expectStorageOperation(findStorageTaggedSymbol(spi, 'src/db.ts', {
      operation: '$transaction',
      candidateNames: ['persistUsersInTransaction', '$transaction', 'transaction'],
    }), { role: /^prisma_/, operation: '$transaction' })
  })

  it('classifies repository-style CRUD methods as persistence endpoints', () => {
    writeFile(sandbox, 'src/report.repository.ts', [
      'export class ReportRepository {',
      '  async save(): Promise<void> {}',
      '  async create(): Promise<void> {}',
      '  async update(): Promise<void> {}',
      '  async upsert(): Promise<void> {}',
      '  async findUnique(): Promise<void> {}',
      '  async findMany(): Promise<void> {}',
      '}',
    ].join('\n') + '\n')

    const spi = build(sandbox)

    expectStorageOperation(
      findSymbol(spi, 'src/report.repository.ts', 'ReportRepository.save', 'method'),
      { operation: 'save' },
    )
    expectStorageOperation(
      findSymbol(spi, 'src/report.repository.ts', 'ReportRepository.create', 'method'),
      { operation: 'create' },
    )
    expectStorageOperation(
      findSymbol(spi, 'src/report.repository.ts', 'ReportRepository.update', 'method'),
      { operation: 'update' },
    )
    expectStorageOperation(
      findSymbol(spi, 'src/report.repository.ts', 'ReportRepository.upsert', 'method'),
      { operation: 'upsert' },
    )
    expectStorageOperation(
      findSymbol(spi, 'src/report.repository.ts', 'ReportRepository.findUnique', 'method'),
      { operation: 'findUnique' },
    )
    expectStorageOperation(
      findSymbol(spi, 'src/report.repository.ts', 'ReportRepository.findMany', 'method'),
      { operation: 'findMany' },
    )
  })

  it('does not tag generic helper names outside repository or ORM contexts', () => {
    writeFile(sandbox, 'src/helpers.ts', [
      'export function save(value: string): string {',
      '  return value.trim()',
      '}',
      'export class ReportFormatter {',
      '  create(value: string): string {',
      '    return value.toUpperCase()',
      '  }',
      '  update(value: string): string {',
      '    return value.toLowerCase()',
      '  }',
      '  upsert(value: string): string {',
      '    return value',
      '  }',
      '  findUnique(values: string[]): string | undefined {',
      '    return values[0]',
      '  }',
      '  findMany(values: string[]): string[] {',
      '    return values',
      '  }',
      '}',
    ].join('\n') + '\n')

    const spi = build(sandbox)

    const genericSymbols = [
      findSymbol(spi, 'src/helpers.ts', 'save', 'function'),
      findSymbol(spi, 'src/helpers.ts', 'ReportFormatter.create', 'method'),
      findSymbol(spi, 'src/helpers.ts', 'ReportFormatter.update', 'method'),
      findSymbol(spi, 'src/helpers.ts', 'ReportFormatter.upsert', 'method'),
      findSymbol(spi, 'src/helpers.ts', 'ReportFormatter.findUnique', 'method'),
      findSymbol(spi, 'src/helpers.ts', 'ReportFormatter.findMany', 'method'),
    ]

    for (const symbol of genericSymbols) {
      expect(symbol).toBeDefined()
      expect(symbol?.framework_role).toBeUndefined()
      expect(symbol?.framework_metadata?.storage_operation).toBeUndefined()
    }
  })
})
