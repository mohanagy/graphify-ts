// SPI v1 — React Router framework layer (slices 1c-v.a + 1c-v.b of #72).
//
// React Router (v6.4+ data-router idiom) has two structural patterns the
// SPI substrate cares about:
//
//   1. Router factories — `createBrowserRouter([...])`,
//      `createHashRouter([...])`, `createMemoryRouter([...])`, and
//      `createStaticRouter([...])`. The factory call's receiving variable
//      is tagged with framework_role: 'react_router_router'. Slice 1c-v.b
//      additionally walks the route-config array (first argument) and
//      tags any locally-defined loader / action functions whose names
//      appear in the config with the matching route's `route_path`.
//
//   2. Route-module convention — when a file imports from 'react-router'
//      or 'react-router-dom' AND exports a named function or const called
//      exactly `loader` or `action`, those exports are tagged with
//      framework_role: 'react_router_loader' / 'react_router_action'.
//
// Slice 1c-v.b adds `route_path` to framework_metadata for both router
// objects (the concatenated tree of paths) and for in-config loaders/
// actions. Nested children inherit their parent path with `/` join. Index
// routes (`{ index: true }`) reuse the parent path verbatim. Path-less
// pathless layout routes (`{ children: [...] }` with no `path`) are
// transparent — children inherit the grandparent path.
//
// JSX route definitions (`<Route path="/x" element={<X />} />`) and
// hook-based detection (useNavigate, useLoaderData, etc.) remain out of
// scope — they're structurally more invasive and would land in a follow-
// up after a real codebase asks for them.

import ts from 'typescript'

import type { SpiFrameworkRole, SpiSymbol } from './types.js'

const REACT_ROUTER_MODULE_SPECIFIERS: ReadonlySet<string> = new Set([
  'react-router',
  'react-router-dom',
])

const ROUTER_FACTORY_NAMES: ReadonlySet<string> = new Set([
  'createBrowserRouter',
  'createHashRouter',
  'createMemoryRouter',
  'createStaticRouter',
])

const ROUTE_MODULE_EXPORT_NAMES: ReadonlyMap<string, SpiFrameworkRole> = new Map([
  ['loader', 'react_router_loader'],
  ['action', 'react_router_action'],
])

type ReactRouterBindings = {
  /** Local names for the named factory imports. */
  routerFactories: Set<string>
  /** True when the file imports anything from react-router(-dom). */
  hasReactRouterImport: boolean
}

export type DetectReactRouterFrameworkContext = {
  sourceFile: ts.SourceFile
  fileId: string
  symbolsByFile: Map<string, SpiSymbol[]>
}

export function detectReactRouterFramework(ctx: DetectReactRouterFrameworkContext): void {
  const bindings = collectBindings(ctx.sourceFile)
  if (!bindings.hasReactRouterImport) return

  // 1. Router factory detection: walk top-level variable declarations,
  // tag those initialised with a known factory call. While we're walking
  // the call, also collect the route-config tree so we can derive
  // route_path metadata and tag in-config loader/action identifiers.
  const routeAssignments: RouteAssignment[] = []
  for (const stmt of ctx.sourceFile.statements) {
    if (!ts.isVariableStatement(stmt)) continue
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !decl.initializer) continue
      if (!isFactoryCall(decl.initializer, bindings.routerFactories)) continue

      // Collect route assignments from the config array (first argument).
      // Two AST shapes accepted:
      //   1. Inline literal: createBrowserRouter([{path:...}, ...])
      //   2. Hoisted: const routes = [{path:...}]; createBrowserRouter(routes)
      // For (2) we walk the file's top-level VariableDeclarations to find
      // the same-file source array. Cross-file hoisting (a const exported
      // from another file) remains out of scope — requires the type
      // checker and produces strictly diminishing returns; can be added
      // later if a real codebase asks for it.
      const configArg = (decl.initializer as ts.CallExpression).arguments[0]
      const collected: RouteAssignment[] = []
      const resolvedArray = resolveRouteConfigArray(configArg, ctx.sourceFile)
      if (resolvedArray) {
        collectRouteAssignments(resolvedArray, '', collected)
      }

      // The router symbol's route_path is the canonical roots joined; for
      // a typical single-tree router this is just '/'. Tag the router
      // with the union of all top-level paths so consumers can find it.
      const topPaths = collected
        .filter((a) => a.depth === 0)
        .map((a) => a.routePath)
      const routerRoutePath = topPaths.length === 1
        ? topPaths[0]
        : (topPaths.length === 0 ? '/' : topPaths.join('|'))
      tagSymbolByName(ctx, decl.name.text, 'react_router_router', { route_path: routerRoutePath })

      // Tag in-file loader/action identifiers that the config references.
      routeAssignments.push(...collected)
    }
  }

  for (const assignment of routeAssignments) {
    if (assignment.loaderName) {
      tagSymbolByName(ctx, assignment.loaderName, 'react_router_loader', {
        route_path: assignment.routePath,
      })
    }
    if (assignment.actionName) {
      tagSymbolByName(ctx, assignment.actionName, 'react_router_action', {
        route_path: assignment.routePath,
      })
    }
  }

  // 2. Route-module convention: tag named exports called `loader` or
  // `action`. Three AST shapes to recognise:
  //   * export function loader() {}
  //   * export const loader = () => {}
  //   * function loader() {}; export { loader }   (re-export form — skipped here)
  for (const stmt of ctx.sourceFile.statements) {
    // export function loader() {}
    if (ts.isFunctionDeclaration(stmt) && stmt.name && hasExportModifier(stmt)) {
      const role = ROUTE_MODULE_EXPORT_NAMES.get(stmt.name.text)
      if (role) tagSymbolByName(ctx, stmt.name.text, role)
      continue
    }

    // export const loader = ...
    if (ts.isVariableStatement(stmt) && hasExportModifier(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue
        const role = ROUTE_MODULE_EXPORT_NAMES.get(decl.name.text)
        if (role) tagSymbolByName(ctx, decl.name.text, role)
      }
    }
  }
}

/** Resolve the config argument to an ArrayLiteralExpression. Accepts:
 *   - the array literal directly (the common inline case)
 *   - an Identifier that refers to a same-file const/let/var whose
 *     initializer is an array literal
 *  Returns null when neither shape matches; the detector skips route-
 *  assignment collection but still tags the router with its role. */
function resolveRouteConfigArray(
  expr: ts.Expression | undefined,
  sourceFile: ts.SourceFile,
): ts.ArrayLiteralExpression | null {
  if (!expr) return null
  if (ts.isArrayLiteralExpression(expr)) return expr
  if (!ts.isIdentifier(expr)) return null
  const name = expr.text
  for (const stmt of sourceFile.statements) {
    if (!ts.isVariableStatement(stmt)) continue
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || decl.name.text !== name) continue
      if (decl.initializer && ts.isArrayLiteralExpression(decl.initializer)) {
        return decl.initializer
      }
      // Same-name identifier exists but isn't an array literal — bail out
      // rather than falling through to a different declaration.
      return null
    }
  }
  return null
}

/** A flat record describing one route node in the config tree, after path
 *  composition with its ancestors. `depth` is the nesting level — top-
 *  level routes have depth 0. */
type RouteAssignment = {
  routePath: string
  depth: number
  loaderName: string | null
  actionName: string | null
}

/** Walks a route-config array literal and emits one RouteAssignment per
 *  recognised object literal. Children inherit the parent's path; index
 *  routes (`{ index: true }`) reuse the parent's path verbatim. Pathless
 *  layout routes (no `path` property but `children` present) pass through
 *  transparently — the grandparent's path is used for children. */
function collectRouteAssignments(
  array: ts.ArrayLiteralExpression,
  parentPath: string,
  out: RouteAssignment[],
  depth = 0,
): void {
  for (const element of array.elements) {
    if (!ts.isObjectLiteralExpression(element)) continue
    const fields = readRouteFields(element)

    // Resolve this route's path. Three cases:
    //  - explicit `path`: join with parent
    //  - `index: true` (no path): reuse parent verbatim
    //  - no path, has children: pathless layout — keep parent unchanged
    let effectivePath: string
    if (fields.path !== null) {
      effectivePath = joinRoutePaths(parentPath, fields.path)
    } else if (fields.isIndex) {
      effectivePath = parentPath === '' ? '/' : parentPath
    } else {
      effectivePath = parentPath
    }

    // Emit an assignment if there's anything to tag (path-bearing route,
    // index route, or a route that names a loader/action even on a
    // pathless layout — the layout's loader is real).
    if (fields.path !== null || fields.isIndex || fields.loaderName || fields.actionName) {
      out.push({
        routePath: effectivePath === '' ? '/' : effectivePath,
        depth,
        loaderName: fields.loaderName,
        actionName: fields.actionName,
      })
    }

    // Recurse into children.
    if (fields.children) {
      collectRouteAssignments(fields.children, effectivePath, out, depth + 1)
    }
  }
}

type RouteFields = {
  path: string | null
  isIndex: boolean
  loaderName: string | null
  actionName: string | null
  children: ts.ArrayLiteralExpression | null
}

function readRouteFields(obj: ts.ObjectLiteralExpression): RouteFields {
  const fields: RouteFields = {
    path: null,
    isIndex: false,
    loaderName: null,
    actionName: null,
    children: null,
  }
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) {
      // Shorthand property like `{ loader, action }` resolves to the
      // local identifier with the same name as the property.
      if (ts.isShorthandPropertyAssignment(prop)) {
        const key = prop.name.text
        if (key === 'loader') fields.loaderName = prop.name.text
        else if (key === 'action') fields.actionName = prop.name.text
      }
      continue
    }
    const key = readPropertyKey(prop.name)
    if (key === null) continue
    if (key === 'path' && ts.isStringLiteralLike(prop.initializer)) {
      fields.path = prop.initializer.text
    } else if (key === 'index' && prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
      fields.isIndex = true
    } else if (key === 'loader' && ts.isIdentifier(prop.initializer)) {
      fields.loaderName = prop.initializer.text
    } else if (key === 'action' && ts.isIdentifier(prop.initializer)) {
      fields.actionName = prop.initializer.text
    } else if (key === 'children' && ts.isArrayLiteralExpression(prop.initializer)) {
      fields.children = prop.initializer
    }
  }
  return fields
}

function readPropertyKey(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name)) return name.text
  if (ts.isStringLiteralLike(name)) return name.text
  return null
}

/** Join the parent's URL path with a child's URL fragment. React Router
 *  treats trailing/leading slashes leniently — we apply the same rule:
 *  the join is exactly one `/` between the two parts, and the result has
 *  no trailing slash (unless the result IS just `/`). */
function joinRoutePaths(parent: string, child: string): string {
  // Absolute child: replaces parent entirely (React Router allows this).
  if (child.startsWith('/')) {
    return child === '/' ? '/' : child.replace(/\/+$/, '')
  }
  const trimmedParent = parent.replace(/\/+$/, '')
  const trimmedChild = child.replace(/^\/+/, '').replace(/\/+$/, '')
  if (trimmedChild === '') return trimmedParent === '' ? '/' : trimmedParent
  const joined = trimmedParent + '/' + trimmedChild
  return joined.startsWith('/') ? joined : '/' + joined
}

function collectBindings(sourceFile: ts.SourceFile): ReactRouterBindings {
  const bindings: ReactRouterBindings = {
    routerFactories: new Set<string>(),
    hasReactRouterImport: false,
  }
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt) || !stmt.importClause) continue
    if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue
    if (!REACT_ROUTER_MODULE_SPECIFIERS.has(stmt.moduleSpecifier.text)) continue

    bindings.hasReactRouterImport = true
    const named = stmt.importClause.namedBindings
    if (!named || !ts.isNamedImports(named)) continue
    for (const element of named.elements) {
      const importedName = element.propertyName?.text ?? element.name.text
      if (ROUTER_FACTORY_NAMES.has(importedName)) {
        bindings.routerFactories.add(element.name.text)
      }
    }
  }
  return bindings
}

function isFactoryCall(expression: ts.Expression, factoryNames: ReadonlySet<string>): boolean {
  if (!ts.isCallExpression(expression)) return false
  const callee = expression.expression
  if (ts.isIdentifier(callee)) return factoryNames.has(callee.text)
  return false
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
  ctx: DetectReactRouterFrameworkContext,
  name: string,
  role: SpiFrameworkRole,
  metadata?: Record<string, unknown>,
): void {
  const symbols = ctx.symbolsByFile.get(ctx.fileId)
  if (!symbols) return
  for (const symbol of symbols) {
    if (symbol.name === name && symbol.framework_role === undefined) {
      symbol.framework_role = role
      if (metadata) {
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
