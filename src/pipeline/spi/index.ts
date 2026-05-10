// SPI v1 — public re-exports.
//
// Slices 1a + 1b + 2a + 2b + 3a + 3c + 3b + 3b-ii:
//   * types + file layer + imports/exports edges
//   * symbol layer + declares edges
//   * call layer + type layer (extends/implements/param_type/return_type)
//   * diff overlay (computed on demand against a base/head ref)
//   * heuristic test layer (covered_by edges)
//   * NestJS framework base (framework_role tagging + module_imports/
//     module_provides/module_exports/controller_route)
//   * NestJS framework quality-of-life: guards/pipes/intercepts edges,
//     injects edges from constructor types and @Inject('TOKEN'),
//     dynamic Module.forRoot/forRootAsync handling.
//
// The projection back to today's graph.json (slice 1c) lands separately.

export type {
  SpiVersion,
  SemanticProgramIndex,
  SpiWorkspace,
  SpiLanguage,
  SpiFile,
  SpiSymbolKind,
  SpiPosition,
  SpiRange,
  SpiFrameworkRole,
  SpiSymbol,
  SpiEdgeKind,
  SpiEdgeConfidence,
  SpiEdgeSource,
  SpiEdgeEvidence,
  SpiEdge,
  SpiDiagnosticLevel,
  SpiDiagnosticEvidence,
  SpiDiagnostic,
  SpiDiffOverlay,
} from './types.js'

export {
  buildSpi,
  buildSpiFileLayer,
  type BuildSpiOptions,
  type BuildSpiFileLayerOptions,
} from './build.js'

export {
  computeSpiDiffOverlay,
  type ComputeSpiDiffOverlayOptions,
  type GitDiffRunner,
} from './diff-overlay.js'

export { isTestFilePath } from './test-layer.js'

export {
  detectNestFramework,
  collectNestTokenMap,
  type DetectNestFrameworkContext,
  type CollectNestTokenMapOptions,
  type NestTokenMap,
  type NestTokenBinding,
} from './framework-nestjs.js'
