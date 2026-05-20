// SPI v1 — Prisma framework layer (v0.17 #83).
//
// Prisma's main schema lives in `schema.prisma` (a Prisma-specific DSL),
// not TypeScript. The TypeScript surface is the generated client:
//
//   import { PrismaClient } from '@prisma/client'
//   const prisma = new PrismaClient()
//   await prisma.user.findMany()      // model access pattern
//   await prisma.user.create({...})
//
// Detection scope (intentionally narrow for this initial slice):
//
//   * `new PrismaClient()` instantiation → variable tagged `prisma_client`
//
// Out of scope (deferred):
//   * Model-access tagging (`prisma.user.findMany`) — would require
//     visiting every property-access chain in the workspace; substantial
//     and noisy. Would need careful per-symbol attribution.
//   * schema.prisma parsing — Prisma DSL isn't TypeScript; a real schema
//     substrate is its own slice train.
//   * Custom-named client imports / re-exports — covered for the most
//     common `import { PrismaClient } from '@prisma/client'` pattern.

import ts from 'typescript'

import type {
  SpiFrameworkMetadata,
  SpiFrameworkRole,
  SpiStorageOperation,
  SpiSymbol,
} from './types.js'

const PRISMA_MODULE_SPECIFIERS: ReadonlySet<string> = new Set([
  '@prisma/client',
])

export type DetectPrismaFrameworkContext = {
  sourceFile: ts.SourceFile
  fileId: string
  symbolsByFile: Map<string, SpiSymbol[]>
  symbols: SpiSymbol[]
}

interface PrismaBindings {
  hasPrismaImport: boolean
  /** Local names that refer to PrismaClient class. */
  prismaClassNames: Set<string>
}

const PRISMA_READER_OPERATIONS: ReadonlySet<SpiStorageOperation> = new Set([
  'findUnique',
  'findMany',
])

const PRISMA_WRITER_OPERATIONS: ReadonlySet<SpiStorageOperation> = new Set([
  'create',
  'update',
  'upsert',
  '$transaction',
])

const REPOSITORY_READER_OPERATIONS: ReadonlySet<SpiStorageOperation> = new Set([
  'findUnique',
  'findMany',
])

const REPOSITORY_WRITER_OPERATIONS: ReadonlySet<SpiStorageOperation> = new Set([
  'save',
  'create',
  'update',
  'upsert',
])

export function detectPrismaFramework(ctx: DetectPrismaFrameworkContext): void {
  detectRepositoryStorageSemantics(ctx)

  const bindings = collectBindings(ctx.sourceFile)
  if (!bindings.hasPrismaImport || bindings.prismaClassNames.size === 0) return

  const prismaClientBindings = new Set<string>()

  // Find `const prisma = new PrismaClient()` patterns and tag the binding.
  for (const stmt of ctx.sourceFile.statements) {
    if (!ts.isVariableStatement(stmt)) continue
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !decl.initializer) continue
      if (!ts.isNewExpression(decl.initializer)) continue
      if (!ts.isIdentifier(decl.initializer.expression)) continue
      if (!bindings.prismaClassNames.has(decl.initializer.expression.text)) continue
      prismaClientBindings.add(decl.name.text)
      tagSymbolByName(ctx, decl.name.text, 'prisma_client', null)
    }
  }

  if (prismaClientBindings.size === 0) return

  const seenSyntheticIds = new Set<string>()
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const operation = detectPrismaStorageOperation(node.expression, prismaClientBindings)
      if (operation) {
        synthesizePrismaStorageSymbol(ctx, node, operation, seenSyntheticIds)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(ctx.sourceFile)
}

function collectBindings(sourceFile: ts.SourceFile): PrismaBindings {
  const bindings: PrismaBindings = {
    hasPrismaImport: false,
    prismaClassNames: new Set<string>(),
  }
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt) || !stmt.importClause) continue
    if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue
    if (!PRISMA_MODULE_SPECIFIERS.has(stmt.moduleSpecifier.text)) continue
    bindings.hasPrismaImport = true
    const named = stmt.importClause.namedBindings
    if (!named || !ts.isNamedImports(named)) continue
    for (const element of named.elements) {
      const importedName = element.propertyName?.text ?? element.name.text
      if (importedName === 'PrismaClient') {
        bindings.prismaClassNames.add(element.name.text)
      }
    }
  }
  return bindings
}

function tagSymbolByName(
  ctx: DetectPrismaFrameworkContext,
  name: string,
  role: SpiFrameworkRole,
  metadata: SpiFrameworkMetadata | null,
): void {
  const symbols = ctx.symbolsByFile.get(ctx.fileId)
  if (!symbols) return
  for (const symbol of symbols) {
    if (symbol.name === name && symbol.framework_role === undefined) {
      symbol.framework_role = role
      if (metadata && Object.keys(metadata).length > 0) {
        const merged: Record<string, unknown> = { ...(symbol.framework_metadata ?? {}) }
        for (const [key, value] of Object.entries(metadata)) {
          if (value !== undefined) merged[key] = value
        }
        symbol.framework_metadata = merged
      }
      return
    }
  }
}

function detectRepositoryStorageSemantics(ctx: DetectPrismaFrameworkContext): void {
  for (const stmt of ctx.sourceFile.statements) {
    if (!ts.isClassDeclaration(stmt) || !stmt.name) continue
    const className = stmt.name.text
    if (!className.endsWith('Repository')) continue

    for (const member of stmt.members) {
      if (!ts.isMethodDeclaration(member)) continue
      const methodName = readMethodName(member.name)
      if (!methodName) continue

      const role = repositoryRoleForOperation(methodName)
      if (!role) continue

      tagSymbolByName(ctx, `${className}.${methodName}`, role, {
        storage_operation: methodName,
      })
    }
  }
}

function repositoryRoleForOperation(name: string): Extract<SpiFrameworkRole, 'repository_reader' | 'repository_writer'> | null {
  if (REPOSITORY_READER_OPERATIONS.has(name as SpiStorageOperation)) return 'repository_reader'
  if (REPOSITORY_WRITER_OPERATIONS.has(name as SpiStorageOperation)) return 'repository_writer'
  return null
}

function readMethodName(name: ts.PropertyName): SpiStorageOperation | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    const text = name.text
    return isStorageOperation(text) ? text : null
  }
  return null
}

function isStorageOperation(value: string): value is SpiStorageOperation {
  return PRISMA_READER_OPERATIONS.has(value as SpiStorageOperation)
    || PRISMA_WRITER_OPERATIONS.has(value as SpiStorageOperation)
    || REPOSITORY_WRITER_OPERATIONS.has(value as SpiStorageOperation)
}

function detectPrismaStorageOperation(
  expression: ts.LeftHandSideExpression,
  prismaClientBindings: ReadonlySet<string>,
): Extract<SpiStorageOperation, 'findUnique' | 'findMany' | 'create' | 'update' | 'upsert' | '$transaction'> | null {
  if (!ts.isPropertyAccessExpression(expression)) return null

  const operation = expression.name.text
  if (!isPrismaOperation(operation)) return null

  if (operation === '$transaction') {
    return isTaggedPrismaRoot(expression.expression, prismaClientBindings) ? operation : null
  }

  if (!ts.isPropertyAccessExpression(expression.expression)) return null
  return isTaggedPrismaRoot(expression.expression.expression, prismaClientBindings) ? operation : null
}

function isPrismaOperation(value: string): value is Extract<SpiStorageOperation, 'findUnique' | 'findMany' | 'create' | 'update' | 'upsert' | '$transaction'> {
  return PRISMA_READER_OPERATIONS.has(value as SpiStorageOperation)
    || PRISMA_WRITER_OPERATIONS.has(value as SpiStorageOperation)
}

function isTaggedPrismaRoot(node: ts.Expression, prismaClientBindings: ReadonlySet<string>): boolean {
  return ts.isIdentifier(node) && prismaClientBindings.has(node.text)
}

function prismaRoleForOperation(
  operation: Extract<SpiStorageOperation, 'findUnique' | 'findMany' | 'create' | 'update' | 'upsert' | '$transaction'>,
): Extract<SpiFrameworkRole, 'prisma_model_reader' | 'prisma_model_writer'> {
  return PRISMA_READER_OPERATIONS.has(operation)
    ? 'prisma_model_reader'
    : 'prisma_model_writer'
}

function synthesizePrismaStorageSymbol(
  ctx: DetectPrismaFrameworkContext,
  call: ts.CallExpression,
  operation: Extract<SpiStorageOperation, 'findUnique' | 'findMany' | 'create' | 'update' | 'upsert' | '$transaction'>,
  seenSyntheticIds: Set<string>,
): void {
  const sourceFile = call.getSourceFile()
  const start = sourceFile.getLineAndCharacterOfPosition(call.expression.getStart(sourceFile))
  const end = sourceFile.getLineAndCharacterOfPosition(call.expression.getEnd())
  const id = `symbol:${ctx.fileId}/function/prisma.${operation}.L${start.line + 1}.C${start.character + 1}`
  if (seenSyntheticIds.has(id)) return
  seenSyntheticIds.add(id)

  const synthetic: SpiSymbol = {
    id,
    file_id: ctx.fileId,
    name: `prisma.${operation}.L${start.line + 1}.C${start.character + 1}`,
    kind: 'function',
    range: {
      start: { line: start.line + 1, column: start.character + 1 },
      end: { line: end.line + 1, column: end.character + 1 },
    },
    exported: false,
    framework_role: prismaRoleForOperation(operation),
    framework_metadata: {
      storage_operation: operation,
    },
  }

  ctx.symbols.push(synthetic)
  const fileSymbols = ctx.symbolsByFile.get(ctx.fileId)
  if (fileSymbols) fileSymbols.push(synthetic)
  else ctx.symbolsByFile.set(ctx.fileId, [synthetic])
}
