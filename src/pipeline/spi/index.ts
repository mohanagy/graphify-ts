// SPI v1 — public re-exports.
//
// Slices 1a + 1b + 2a + 2b + 3a:
//   * types + file layer + imports/exports edges
//   * symbol layer + declares edges
//   * call layer + type layer (extends/implements/param_type/return_type)
//   * diff overlay (computed on demand against a base/head ref)
//
// Test layer, framework (NestJS), and the projection back to today's
// graph.json land in subsequent slices of #72.

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
