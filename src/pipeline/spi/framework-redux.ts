// SPI v1 — Redux Toolkit framework layer (slice 1c-vi.a of #72).
//
// Redux Toolkit's idiomatic surface is a small set of factory functions:
//
//   const counterSlice = createSlice({ name: 'counter', ... })
//   const store        = configureStore({ reducer: ... })
//   const api          = createApi({ ... })                  // RTK Query
//   const selectFoo    = createSelector([...], (...) => ...)
//   const fetchUser    = createAsyncThunk('user/fetch', ...)
//
// Each factory call's receiving variable is tagged with a matching
// SpiFrameworkRole. Selectors built via `reselect` (`createSelector` from
// 'reselect' rather than '@reduxjs/toolkit') are accepted too because
// they're functionally identical and routinely re-exported from RTK.
//
// Detection is import-gated: a file must import from one of the Redux
// module specifiers for any tagging to happen. This avoids tagging
// same-named local helpers in unrelated files.
//
// Out of scope (deferred to follow-up slices):
//
//   * Slice metadata: extracting `name`, reducer keys, and the auto-
//     generated action-creator surface. Requires walking the object-
//     literal argument to createSlice and may want a framework_metadata
//     entry similar to slice 1c-ii.f's route_path.
//   * `createReducer` (functional reducer composition) — non-essential
//     and can be added when a real codebase asks for it.
//   * `useSelector` / `useDispatch` hook detection — structural noise;
//     consumers should locate selectors via framework_role instead.

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
      const role = factoryCallRole(decl.initializer, bindings.factories)
      if (!role) continue
      tagSymbolByName(ctx, decl.name.text, role)
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

function factoryCallRole(
  expression: ts.Expression,
  factories: Map<string, SpiFrameworkRole>,
): SpiFrameworkRole | null {
  if (!ts.isCallExpression(expression)) return null
  const callee = expression.expression
  // createSlice(...)
  if (ts.isIdentifier(callee)) return factories.get(callee.text) ?? null
  // api.injectEndpoints(...) and other property-access factory variants
  // are intentionally NOT tagged in this slice — they're derived
  // operations on already-tagged factory results, not new factory calls.
  return null
}

function tagSymbolByName(
  ctx: DetectReduxFrameworkContext,
  name: string,
  role: SpiFrameworkRole,
): void {
  const symbols = ctx.symbolsByFile.get(ctx.fileId)
  if (!symbols) return
  for (const symbol of symbols) {
    if (symbol.name === name && symbol.framework_role === undefined) {
      symbol.framework_role = role
      return
    }
  }
}
