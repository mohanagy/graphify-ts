// SPI v1 — Redux Toolkit framework layer (slices 1c-vi.a + 1c-vi.b of #72).
//
// Redux Toolkit's idiomatic surface is a small set of factory functions:
//
//   const counterSlice = createSlice({ name: 'counter', ... })
//   const store        = configureStore({ reducer: ... })
//   const api          = createApi({ ... })                  // RTK Query
//   const selectFoo    = createSelector([...], (...) => ...)
//   const fetchUser    = createAsyncThunk('user/fetch', ...)
//
// Slice 1c-vi.a tagged the receiving variable's `framework_role`. Slice
// 1c-vi.b adds structural metadata so consumers don't have to re-read the
// AST to learn the slice's name, reducer keys, thunk type prefix, or
// RTK Query endpoint names. Tagged shapes:
//
//   createSlice          → { slice_name, reducer_keys[], action_creators[] }
//   configureStore       → { reducer_keys[] }       (if `reducer: {...}`)
//   createAsyncThunk     → { type_prefix }          (first-arg string)
//   createApi            → { endpoint_names[] }     (object keys of `endpoints` fn)
//   createSelector       → no metadata (selectors are anonymous-by-design)
//
// Detection is import-gated: a file must import from one of the Redux
// module specifiers for any tagging to happen. This avoids tagging
// same-named local helpers in unrelated files.
//
// Out of scope (deferred):
//
//   * Following the auto-generated action creators back to the
//     individual `actions.fooBar` properties on the slice export. The
//     `action_creators` list is the names from the reducers object,
//     which IS the canonical surface — consumers can look up
//     `<sliceName>.actions.<name>` themselves.
//   * `createReducer` (functional reducer composition) — non-essential
//     and can be added when a real codebase asks for it.
//   * Property-access factory variants (`api.injectEndpoints({...})`)
//     remain unhandled — they're derived operations on already-tagged
//     factory results, not new factory calls.

import ts from 'typescript'

import type { SpiFrameworkRole, SpiSymbol } from './types.js'

const REDUX_MODULE_SPECIFIERS: ReadonlySet<string> = new Set([
  '@reduxjs/toolkit',
  '@reduxjs/toolkit/query',
  '@reduxjs/toolkit/query/react',
  'redux',
  'reselect',
])

const FACTORY_TO_ROLE: ReadonlyMap<string, SpiFrameworkRole> = new Map([
  ['createSlice', 'redux_slice'],
  ['configureStore', 'redux_store'],
  ['createStore', 'redux_store'],
  ['createSelector', 'redux_selector'],
  ['createDraftSafeSelector', 'redux_selector'],
  ['createAsyncThunk', 'redux_async_thunk'],
  ['createApi', 'redux_rtk_query_api'],
])

type ReduxBindings = {
  /** Local name → role for every imported Redux factory. Aliased
   *  imports (`createSlice as makeSlice`) use the local name as the key
   *  and resolve the role from the original imported name. */
  factories: Map<string, SpiFrameworkRole>
  /** True iff the file imported anything from a Redux module specifier. */
  hasReduxImport: boolean
}

export type DetectReduxFrameworkContext = {
  sourceFile: ts.SourceFile
  fileId: string
  symbolsByFile: Map<string, SpiSymbol[]>
}

export function detectReduxFramework(ctx: DetectReduxFrameworkContext): void {
  const bindings = collectBindings(ctx.sourceFile)
  if (!bindings.hasReduxImport || bindings.factories.size === 0) return

  for (const stmt of ctx.sourceFile.statements) {
    if (!ts.isVariableStatement(stmt)) continue
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !decl.initializer) continue
      const tag = factoryCallTag(decl.initializer, bindings.factories)
      if (!tag) continue
      tagSymbolByName(ctx, decl.name.text, tag.role, tag.metadata)
    }
  }
}

function collectBindings(sourceFile: ts.SourceFile): ReduxBindings {
  const bindings: ReduxBindings = {
    factories: new Map<string, SpiFrameworkRole>(),
    hasReduxImport: false,
  }
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt) || !stmt.importClause) continue
    if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue
    if (!REDUX_MODULE_SPECIFIERS.has(stmt.moduleSpecifier.text)) continue

    bindings.hasReduxImport = true
    const named = stmt.importClause.namedBindings
    if (!named || !ts.isNamedImports(named)) continue
    for (const element of named.elements) {
      const importedName = element.propertyName?.text ?? element.name.text
      const role = FACTORY_TO_ROLE.get(importedName)
      if (role) bindings.factories.set(element.name.text, role)
    }
  }
  return bindings
}

type FactoryTag = {
  role: SpiFrameworkRole
  metadata: Record<string, unknown> | null
}

function factoryCallTag(
  expression: ts.Expression,
  factories: Map<string, SpiFrameworkRole>,
): FactoryTag | null {
  if (!ts.isCallExpression(expression)) return null
  const callee = expression.expression
  // createSlice(...)
  if (!ts.isIdentifier(callee)) {
    // api.injectEndpoints(...) and other property-access factory variants
    // are intentionally NOT tagged — they're derived operations on
    // already-tagged factory results, not new factory calls.
    return null
  }
  const role = factories.get(callee.text)
  if (!role) return null
  return { role, metadata: extractFactoryMetadata(role, expression) }
}

/** Extract per-factory metadata from the call's argument shape. Each
 *  factory has a stable single-argument convention — when the argument
 *  isn't the expected shape, return null and rely on the role tag alone. */
function extractFactoryMetadata(
  role: SpiFrameworkRole,
  call: ts.CallExpression,
): Record<string, unknown> | null {
  const arg0 = call.arguments[0]
  if (!arg0) return null

  if (role === 'redux_slice') {
    if (!ts.isObjectLiteralExpression(arg0)) return null
    const sliceName = readStringProperty(arg0, 'name')
    const reducers = readObjectProperty(arg0, 'reducers')
    const reducerKeys = reducers ? readObjectLiteralKeys(reducers) : []
    return {
      slice_name: sliceName,
      reducer_keys: reducerKeys,
      action_creators: reducerKeys,
    }
  }

  if (role === 'redux_store') {
    if (!ts.isObjectLiteralExpression(arg0)) return null
    const reducer = readObjectProperty(arg0, 'reducer')
    // `configureStore({ reducer: { auth, posts } })` exposes the slice
    // namespace; `{ reducer: rootReducer }` does not.
    const reducerKeys = reducer ? readObjectLiteralKeys(reducer) : []
    return reducerKeys.length > 0 ? { reducer_keys: reducerKeys } : null
  }

  if (role === 'redux_async_thunk') {
    // createAsyncThunk('user/fetch', ...) — first arg is the type prefix.
    if (ts.isStringLiteralLike(arg0)) return { type_prefix: arg0.text }
    return null
  }

  if (role === 'redux_rtk_query_api') {
    if (!ts.isObjectLiteralExpression(arg0)) return null
    // `endpoints: (build) => ({ getUser: ..., updateUser: ... })` —
    // endpoints is an arrow function whose body is the object literal
    // we care about. The value is not itself an object literal, so we
    // read the raw initializer expression and walk inside the function.
    const endpointsExpr = readPropertyInitializer(arg0, 'endpoints')
    if (!endpointsExpr) return null
    const obj = unwrapEndpointsObject(endpointsExpr)
    if (!obj) return null
    const endpointNames = readObjectLiteralKeys(obj)
    return endpointNames.length > 0 ? { endpoint_names: endpointNames } : null
  }

  return null
}

function readStringProperty(obj: ts.ObjectLiteralExpression, key: string): string | null {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    if (!matchesPropertyName(prop.name, key)) continue
    if (ts.isStringLiteralLike(prop.initializer)) return prop.initializer.text
    return null
  }
  return null
}

function readObjectProperty(
  obj: ts.ObjectLiteralExpression,
  key: string,
): ts.ObjectLiteralExpression | null {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    if (!matchesPropertyName(prop.name, key)) continue
    if (ts.isObjectLiteralExpression(prop.initializer)) return prop.initializer
    return null
  }
  return null
}

function readPropertyInitializer(
  obj: ts.ObjectLiteralExpression,
  key: string,
): ts.Expression | null {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    if (!matchesPropertyName(prop.name, key)) continue
    return prop.initializer
  }
  return null
}

function readObjectLiteralKeys(obj: ts.ObjectLiteralExpression): string[] {
  const keys: string[] = []
  for (const prop of obj.properties) {
    if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop) || ts.isMethodDeclaration(prop)) {
      const name = prop.name
      if (ts.isIdentifier(name)) keys.push(name.text)
      else if (ts.isStringLiteralLike(name)) keys.push(name.text)
    }
  }
  return keys
}

/** `endpoints: (build) => ({ getUser: build.query(...), ... })`. Reach
 *  through the arrow function's body to find the returned object literal.
 *  Accepts both the concise form `(b) => ({...})` and the block form
 *  `(b) => { return { ... } }`. */
function unwrapEndpointsObject(expr: ts.Expression): ts.ObjectLiteralExpression | null {
  if (!ts.isArrowFunction(expr) && !ts.isFunctionExpression(expr)) return null
  const body = expr.body
  // Concise: (b) => ({...}) — the parser wraps the object in
  // ParenthesizedExpression to disambiguate from a block.
  if (ts.isParenthesizedExpression(body) && ts.isObjectLiteralExpression(body.expression)) {
    return body.expression
  }
  if (ts.isObjectLiteralExpression(body)) return body
  if (ts.isBlock(body)) {
    for (const stmt of body.statements) {
      if (ts.isReturnStatement(stmt) && stmt.expression) {
        const ret = stmt.expression
        if (ts.isParenthesizedExpression(ret) && ts.isObjectLiteralExpression(ret.expression)) {
          return ret.expression
        }
        if (ts.isObjectLiteralExpression(ret)) return ret
      }
    }
  }
  return null
}

function matchesPropertyName(name: ts.PropertyName, key: string): boolean {
  if (ts.isIdentifier(name)) return name.text === key
  if (ts.isStringLiteralLike(name)) return name.text === key
  return false
}

function tagSymbolByName(
  ctx: DetectReduxFrameworkContext,
  name: string,
  role: SpiFrameworkRole,
  metadata: Record<string, unknown> | null,
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
