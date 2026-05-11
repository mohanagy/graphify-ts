// SPI v1 — Next.js framework layer (slices 1c-iv.a + 1c-iv.b of #72).
//
// Next.js is convention-based rather than call-based: routes, layouts,
// middleware, and API handlers are identified by file path patterns, not
// by AST shapes. This detector walks each file's path and applies the
// matching SpiFrameworkRole to the file's exports.
//
// Conventions recognized:
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
// Slice 1c-iv.b adds `route_path` to framework_metadata for every tagged
// symbol — derived deterministically from the file path:
//
//   app/users/page.tsx              → /users
//   app/users/[id]/page.tsx         → /users/:id
//   app/(auth)/login/page.tsx       → /login          (route groups stripped)
//   app/blog/[...slug]/page.tsx     → /blog/*         (catch-all)
//   app/blog/[[...slug]]/page.tsx   → /blog/*?        (optional catch-all)
//   app/api/users/route.ts          → /api/users
//   pages/users/[id].tsx            → /users/:id
//   pages/api/users/[id].ts         → /api/users/:id  (api prefix preserved)
//   middleware.ts                   → /*              (matches all paths)
//
// The path layer is the same for both routers, modulo the file-name
// stripping rule (app/* uses file basename as the convention key and the
// path ends at the directory; pages/* uses the file basename minus the
// extension as the last segment).

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
  | { kind: 'default'; role: SpiFrameworkRole; routePath: string }
  | { kind: 'http_methods'; role: SpiFrameworkRole; routePath: string }

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
    tagDefaultExport(ctx, match.role, match.routePath)
  } else {
    tagHttpMethodExports(ctx, match.role, match.routePath)
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
    return { kind: 'default', role: 'nextjs_middleware', routePath: '/*' }
  }

  // App router conventions: `app/.../<basename>.tsx?` for pages/layouts/
  // etc., `app/.../route.ts` for route handlers.
  if (normalized.startsWith('app/')) {
    const basename = stripExtension(getBasename(normalized))
    if (basename === 'route') {
      return { kind: 'http_methods', role: 'nextjs_app_route', routePath: appRoutePath(normalized) }
    }
    const role = APP_FILE_CONVENTIONS.get(basename)
    if (role) return { kind: 'default', role, routePath: appRoutePath(normalized) }
    return null
  }

  // Pages router conventions.
  if (normalized.startsWith('pages/')) {
    // `pages/api/...` files are API routes (default export).
    if (normalized.startsWith('pages/api/')) {
      return { kind: 'default', role: 'nextjs_pages_api', routePath: pagesRoutePath(normalized) }
    }
    // Other pages/* files are page components, but skip Next.js'
    // special files (_app, _document, _error, _middleware) and any
    // co-located non-routable file like `_components`.
    const basename = stripExtension(getBasename(normalized))
    if (basename.startsWith('_')) return null
    return { kind: 'default', role: 'nextjs_pages_page', routePath: pagesRoutePath(normalized) }
  }

  return null
}

/** Derive a URL path from a Next.js app-router file path. The file's
 *  basename (`page`, `layout`, `route`, etc.) is stripped because in the
 *  app router the URL is determined by the *directory* containing the
 *  convention file, not the file name. */
function appRoutePath(normalized: string): string {
  // Drop the leading "app/" segment and the final file name.
  const withoutPrefix = normalized.slice('app/'.length)
  const segments = withoutPrefix.split('/').slice(0, -1)
  return segmentsToRoutePath(segments)
}

/** Derive a URL path from a Next.js pages-router file path. Both regular
 *  pages and pages/api use the basename (minus extension) as the trailing
 *  segment — except `index`, which collapses to the parent directory. */
function pagesRoutePath(normalized: string): string {
  const withoutPrefix = normalized.slice('pages/'.length)
  const parts = withoutPrefix.split('/')
  const last = parts[parts.length - 1] ?? ''
  const lastStem = stripExtension(last)
  const allSegments = parts.slice(0, -1)
  if (lastStem !== 'index') allSegments.push(lastStem)
  return segmentsToRoutePath(allSegments)
}

/** Normalise the list of route segments into a leading-`/` URL string.
 *  Applies Next.js' three dynamic-segment transforms:
 *    [foo]      → :foo
 *    [...foo]   → *           (catch-all)
 *    [[...foo]] → *?          (optional catch-all)
 *  Route groups `(group)` and parallel routes `@group` are erased from the
 *  URL — they exist only in the file layout. */
function segmentsToRoutePath(segments: string[]): string {
  const transformed: string[] = []
  for (const raw of segments) {
    // Strip route groups (auth) and parallel/intercepted parent slots
    // @modal — they are layout-only and produce NO URL segment.
    if (raw.startsWith('(') && raw.endsWith(')')) continue
    if (raw.startsWith('@')) continue

    // Strip Next.js intercepting-route prefixes from the folder name:
    //   (.)photo    → photo   (intercept same level)
    //   (..)photo   → photo   (intercept one level up)
    //   (...)photo  → photo   (intercept from root)
    // The folder name itself IS the URL segment; the prefix is metadata
    // that only affects intercept routing, not the final route_path.
    const stripped = raw.replace(/^\(\.{1,3}\)/, '')
    transformed.push(normalizeSegment(stripped))
  }
  if (transformed.length === 0) return '/'
  return '/' + transformed.join('/')
}

function normalizeSegment(segment: string): string {
  // Optional catch-all: [[...slug]] → *?
  if (segment.startsWith('[[...') && segment.endsWith(']]')) return '*?'
  // Catch-all: [...slug] → *
  if (segment.startsWith('[...') && segment.endsWith(']')) return '*'
  // Dynamic: [id] → :id
  if (segment.startsWith('[') && segment.endsWith(']')) {
    return ':' + segment.slice(1, -1)
  }
  return segment
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

function tagDefaultExport(ctx: DetectNextjsFrameworkContext, role: SpiFrameworkRole, routePath: string): void {
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
  tagSymbolByName(ctx, defaultExportName, role, routePath)
}

function tagHttpMethodExports(ctx: DetectNextjsFrameworkContext, role: SpiFrameworkRole, routePath: string): void {
  // App-router route handlers (`app/.../route.ts`) export one function
  // per HTTP method: `export function GET() {}`, `export function
  // POST() {}`, etc. Tag each; record the HTTP method on framework_metadata
  // so consumers can filter by verb.
  for (const stmt of ctx.sourceFile.statements) {
    if (!ts.isFunctionDeclaration(stmt) || !stmt.name) continue
    if (!hasExportModifier(stmt)) continue
    if (!ROUTE_HTTP_NAMES.has(stmt.name.text)) continue
    tagSymbolByName(ctx, stmt.name.text, role, routePath, stmt.name.text)
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

function tagSymbolByName(
  ctx: DetectNextjsFrameworkContext,
  name: string,
  role: SpiFrameworkRole,
  routePath: string,
  httpMethod?: string,
): void {
  const symbols = ctx.symbolsByFile.get(ctx.fileId)
  if (!symbols) return
  for (const symbol of symbols) {
    if (symbol.name === name && symbol.framework_role === undefined) {
      symbol.framework_role = role
      const metadata: Record<string, unknown> = { ...(symbol.framework_metadata ?? {}) }
      metadata.route_path = routePath
      if (httpMethod) metadata.http_method = httpMethod
      symbol.framework_metadata = metadata
      return
    }
  }
}
