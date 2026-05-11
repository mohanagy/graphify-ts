#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const bundleDir = process.argv[2]
if (!bundleDir) {
  console.error('usage: summarize-real-workspaces.mjs <bundle-dir>')
  process.exit(2)
}

const preferredOrder = ['backend', 'monorepo']
const workspaceNames = readdirSync(bundleDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(bundleDir, entry.name, 'summary.json')))
  .map((entry) => entry.name)
  .sort((left, right) => {
    const leftIndex = preferredOrder.indexOf(left)
    const rightIndex = preferredOrder.indexOf(right)
    if (leftIndex !== -1 || rightIndex !== -1) {
      return (leftIndex === -1 ? Number.POSITIVE_INFINITY : leftIndex) - (rightIndex === -1 ? Number.POSITIVE_INFINITY : rightIndex)
    }
    return left.localeCompare(right)
  })

const workspaces = Object.fromEntries(
  workspaceNames.map((name) => [name, JSON.parse(readFileSync(join(bundleDir, name, 'summary.json'), 'utf8'))]),
)

const objectiveMetrics = workspaceNames.flatMap((workspace) => {
  const summary = workspaces[workspace]
  return Object.entries(summary.variants ?? {}).flatMap(([variant, metrics]) => ([
    { workspace, variant, metric: 'build_time_ms', value: metrics.build_time_ms ?? null },
    { workspace, variant, metric: 'graph_size_bytes', value: metrics.graph_size_bytes ?? null },
    { workspace, variant, metric: 'node_count', value: metrics.node_count ?? null },
    { workspace, variant, metric: 'edge_count', value: metrics.edge_count ?? null },
  ]))
})

const qualitativeNotes = [
  'This benchmark can be run on private repos locally.',
  'No private paths or artifacts are committed.',
  'If GoValidate is unavailable, no GoValidate-specific numbers are claimed.',
]

console.log(JSON.stringify({
  workspace_order: workspaceNames,
  workspaces,
  comparison: {
    objective_metrics: objectiveMetrics,
    qualitative_notes: qualitativeNotes,
  },
}, null, 2))
