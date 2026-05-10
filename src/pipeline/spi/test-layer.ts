// SPI v1 — test layer (slice 3c of #72).
//
// Emits `covered_by` edges between source files and the test files that
// import them. Per the design, this layer is intentionally heuristic
// (not type-checker-backed) — its job is to make "what tests cover X?"
// answerable from the SPI without re-scanning, and to provide the
// cross-validated test-coverage signal the selector (#74) and quality
// diagnostics (#78) want.
//
// Confidence rules (from docs/designs/2026-05-10-spi-v1.md):
//   * `high`   — name pattern match (foo.ts ↔ foo.spec.ts) AND the test
//                file imports the source. Cross-validated coverage.
//   * `medium` — test file imports source but no name-pattern match.
//                Could still be coverage (helper test, broad spec) but
//                less confident than a paired *.spec.ts.

import type { SpiEdge, SpiFile } from './types.js'

const TEST_FILE_PATTERNS: ReadonlyArray<RegExp> = [
  /\.spec\.[mc]?[tj]sx?$/i,
  /\.test\.[mc]?[tj]sx?$/i,
  /(^|\/)__tests__\//,
]

const SOURCE_EXT_RE = /\.[mc]?[tj]sx?$/i

export function isTestFilePath(path: string): boolean {
  return TEST_FILE_PATTERNS.some((re) => re.test(path))
}

export type AddTestLayerOptions = {
  files: SpiFile[]
  edges: SpiEdge[]
}

export function addTestLayerEdges(opts: AddTestLayerOptions): void {
  const { files, edges } = opts
  const fileById = new Map(files.map((f) => [f.id, f] as const))
  const testFiles = files.filter((f) => isTestFilePath(f.path))
  if (testFiles.length === 0) return

  // Walk existing imports edges per test file and emit covered_by edges from
  // each imported source file back to the test file. Dedupe by (source,
  // test) pair so a test that imports the same module twice still produces
  // a single edge.
  const seen = new Set<string>()
  for (const testFile of testFiles) {
    const importEdges = edges.filter((e) => e.from === testFile.id && e.kind === 'imports')
    for (const importEdge of importEdges) {
      const target = fileById.get(importEdge.to)
      if (!target) continue
      // Skip test-importing-test (e.g., shared spec helpers); only emit
      // covered_by from a source file to a test that imports it.
      if (isTestFilePath(target.path)) continue

      const dedupeKey = `${target.id}|${testFile.id}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)

      const confidence: 'high' | 'medium' =
        sourceMatchesTestName(target.path, testFile.path) ? 'high' : 'medium'

      const edge: SpiEdge = {
        from: target.id,
        to: testFile.id,
        kind: 'covered_by',
        confidence,
        source: 'heuristic',
      }
      if (importEdge.evidence) {
        edge.evidence = { file_id: testFile.id, range: importEdge.evidence.range }
      }
      edges.push(edge)
    }
  }
}

// Returns true when the test path is the canonical sibling spec for the
// source path. Recognizes:
//   foo.ts            ↔ foo.spec.ts   (and .test.ts variants)
//   pkg/foo.ts        ↔ pkg/foo.test.ts
//   pkg/foo.ts        ↔ pkg/__tests__/foo.spec.ts
function sourceMatchesTestName(sourcePath: string, testPath: string): boolean {
  const sourceBase = sourcePath.replace(SOURCE_EXT_RE, '')
  // Strip the test extension layer (.spec / .test) before stripping the file
  // extension to get the underlying base.
  const testWithoutFileExt = testPath.replace(SOURCE_EXT_RE, '')
  const testBase = testWithoutFileExt.replace(/\.spec$|\.test$/i, '')
  // Drop the __tests__ directory segment if present so a __tests__ sibling
  // canonicalizes to the same base as the source file next door.
  const testBaseFlat = testBase.replace(/(^|\/)__tests__\//, '$1')
  return sourceBase === testBaseFlat
}
