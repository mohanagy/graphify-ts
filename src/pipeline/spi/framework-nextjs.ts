// SPI v1 — Next.js framework layer (slice 1c-iv.a of #72).
//
// Next.js is convention-based rather than call-based: routes, layouts,
// middleware, and API handlers are identified by file path patterns, not
// by AST shapes. This detector walks each file's path and applies the
// matching SpiFrameworkRole to the file's exports.
//
// Conventions recognized in this slice:
//
//   app/<segments>/page.tsx          → nextjs_app_page     (default export)
//   app/<segments>/route.ts          → nextjs_app_route    (named HTTP-method exports)
//   app/<segments>/layout.tsx        → nextjs_app_layout   (default export)
//   app/<segments>/loading.tsx       → nextjs_app_loading  (default export)
//   app/<segments>/error.tsx         → nextjs_app_error    (default export)
//   app/<segments>/template.tsx      → nextjs_app_template (default export)
//   pages/api/<segments>.ts          → nextjs_pages_api    (default export)
//   pages/<segments>.tsx             → nextjs_pages_page   (default export)
//   middleware.ts (workspace root)   → nextjs_middleware   (default export)
//
// For app-router route.ts files the convention is **named** exports per
// HTTP method (`export function GET() {}`, `export function POST() {}`),
// so the detector tags every named export whose name is a recognized
// HTTP verb. For every other convention the convention's payload lives
// on the default export.
//
// Out of scope for this slice (deferred to follow-ups):
//
//   * route_path metadata derived from the file path
//     (e.g. `app/users/[id]/page.tsx` → route_path: '/users/:id'). Slot
//     in framework_metadata reserved for slice 1c-iv.b.
//   * Dynamic segments and route groups: [id], [[...slug]], (group) —
//     same metadata work above.
//   * server/client component detection via the 'use client' directive.

import ts from 'typescript'

import type { SpiFrameworkRole, SpiSymbol } from './types.js'

const APP_FILE_CONVENTIONS: ReadonlyMap<string, SpiFrameworkRole> = new Map([
  ['page', 'nextjs_app_page'],
  ['layout', 'nextjs_app_layout'],
  ['loading', 'nextjs_app_loading'],
  ['error', 'nextjs_app_error'],
  ['template', 'nextjs_app_template'],
])

const ROUTE_HTTP_NAMES: ReadonlySet<string> = new Set([
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD',
])

type NextjsConventionMatch =
  | { kind: 'default'; role: SpiFrameworkRole }
  | { kind: 'http_methods'; role: SpiFrameworkRole }

export type DetectNextjsFrameworkContext = {
  sourceFile: ts.SourceFile
  fileId: string
  /** Workspace-relative POSIX-normalized file path (the SpiFile.path). */
  filePath: string
  symbolsByFile: Map<string, SpiSymbol[]>
}

export function detectNextjsFramework(ctx: DetectNextjsFrameworkContext): void {
  const match = matchConvention(ctx.filePath)
  if (!match) return

  if (match.kind === 'default') {
    tagDefaultExport(ctx, match.role)
  } else {
    tagHttpMethodExports(ctx, match.role)
  }
}

/** Returns the Next.js convention match for a workspace-relative path, or
 *  null when the path doesn't match any convention. The detector accepts
 *  the path with or without a leading `src/` directory (the common Next.js
 *  configuration). */
function matchConvention(filePath: string): NextjsConventionMatch | null {
  const normalized = stripLeadingSrc(filePath)

  // Root middleware: `middleware.ts` or `middleware.tsx`.
  if (normalized === 'middleware.ts' || normalized === 'middleware.tsx') {
    return { kind: 'default', role: 'nextjs_middleware' }
  }

  // App router conventions: `app/.../<basename>.tsx?` for pages/layouts/
  // etc., `app/.../route.ts` for route handlers.
  if (normalized.startsWith('app/')) {
    const basename = stripExtension(getBasename(normalized))
    if (basename === 'route') {
      return { kind: 'http_methods', role: 'nextjs_app_route' }
    }
    const role = APP_FILE_CONVENTIONS.get(basename)
    if (role) return { kind: 'default', role }
    return null
  }

  // Pages router conventions.
  if (normalized.startsWith('pages/')) {
    // `pages/api/...` files are API routes (default export).
    if (normalized.startsWith('pages/api/')) {
      return { kind: 'default', role: 'nextjs_pages_api' }
    }
    // Other pages/* files are page components, but skip Next.js'
    // special files (_app, _document, _error, _middleware) and any
    // co-located non-routable file like `_components`.
    const basename = stripExtension(getBasename(normalized))
    if (basename.startsWith('_')) return null
    return { kind: 'default', role: 'nextjs_pages_page' }
  }

  return null
}

function stripLeadingSrc(filePath: string): string {
  return filePath.startsWith('src/') ? filePath.slice(4) : filePath
}

function getBasename(filePath: string): string {
  const slash = filePath.lastIndexOf('/')
  return slash === -1 ? filePath : filePath.slice(slash + 1)
}

function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? name : name.slice(0, dot)
}

function tagDefaultExport(ctx: DetectNextjsFrameworkContext, role: SpiFrameworkRole): void {
  // A Next.js page/layout/etc. is whatever symbol the file exports as
  // its default. Two AST shapes produce a default export:
  //   1. `export default function Foo() {}` — direct on a declaration.
  //   2. `export default <expr>` — a separate ExportAssignment node.
  // For (2) the expression is usually an Identifier referencing a
  // previously-declared function/class/variable; we resolve back to that
  // name. Anonymous default exports (`export default () => ...`) carry
  // no SpiSymbol today and are skipped — synthesis for them would land
  // in a follow-up slice mirroring slice 1c-ii.e's pattern.
  const defaultExportName = findDefaultExportName(ctx.sourceFile)
  if (defaultExportName === null) return
  tagSymbolByName(ctx, defaultExportName, role)
}

function tagHttpMethodExports(ctx: DetectNextjsFrameworkContext, role: SpiFrameworkRole): void {
  // App-router route handlers (`app/.../route.ts`) export one function
  // per HTTP method: `export function GET() {}`, `export function
  // POST() {}`, etc. Tag each.
  for (const stmt of ctx.sourceFile.statements) {
    if (!ts.isFunctionDeclaration(stmt) || !stmt.name) continue
    if (!hasExportModifier(stmt)) continue
    if (!ROUTE_HTTP_NAMES.has(stmt.name.text)) continue
    tagSymbolByName(ctx, stmt.name.text, role)
  }
}

function findDefaultExportName(sourceFile: ts.SourceFile): string | null {
  for (const stmt of sourceFile.statements) {
    // export default function Foo() {}
    if (ts.isFunctionDeclaration(stmt) && stmt.name && hasExportDefaultModifiers(stmt)) {
      return stmt.name.text
    }
    // export default class Foo {}
    if (ts.isClassDeclaration(stmt) && stmt.name && hasExportDefaultModifiers(stmt)) {
      return stmt.name.text
    }
    // export default <Identifier>
    if (ts.isExportAssignment(stmt) && !stmt.isExportEquals && ts.isIdentifier(stmt.expression)) {
      return stmt.expression.text
    }
  }
  return null
}

function hasExportDefaultModifiers(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined
  if (!modifiers) return false
  let hasExport = false
  let hasDefault = false
  for (const mod of modifiers) {
    if (mod.kind === ts.SyntaxKind.ExportKeyword) hasExport = true
    if (mod.kind === ts.SyntaxKind.DefaultKeyword) hasDefault = true
  }
  return hasExport && hasDefault
}

function hasExportModifier(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined
  if (!modifiers) return false
  for (const mod of modifiers) {
    if (mod.kind === ts.SyntaxKind.ExportKeyword) return true
  }
  return false
}

function tagSymbolByName(ctx: DetectNextjsFrameworkContext, name: string, role: SpiFrameworkRole): void {
  const symbols = ctx.symbolsByFile.get(ctx.fileId)
  if (!symbols) return
  for (const symbol of symbols) {
    if (symbol.name === name && symbol.framework_role === undefined) {
      symbol.framework_role = role
      return
    }
  }
}
