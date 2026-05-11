#!/usr/bin/env node
// Aggregate the per-variant JSON files into a single summary.json.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const resultsDir = process.argv[2]
if (!resultsDir) {
  console.error('usage: summarize.mjs <results-dir>')
  process.exit(2)
}

const variants = ['legacy', 'spi-cold']
const results = {}
for (const variant of variants) {
  const path = join(resultsDir, `${variant}.json`)
  if (!existsSync(path)) continue
  results[variant] = JSON.parse(readFileSync(path, 'utf8'))
}

// Extract spi-warm time from its log via wall-clock — captured separately in the bash script.
const summary = {
  timestamp_iso: new Date().toISOString(),
  variants: results,
  comparison: {},
}

if (results.legacy && results['spi-cold']) {
  const legacy = results.legacy
  const spi = results['spi-cold']
  summary.comparison = {
    build_time_delta_ms: spi.build_time_ms - legacy.build_time_ms,
    build_time_delta_pct: legacy.build_time_ms === 0 ? null : ((spi.build_time_ms - legacy.build_time_ms) / legacy.build_time_ms * 100).toFixed(1),
    graph_size_delta_bytes: spi.graph_size_bytes - legacy.graph_size_bytes,
    graph_size_delta_pct: legacy.graph_size_bytes === 0 ? null : ((spi.graph_size_bytes - legacy.graph_size_bytes) / legacy.graph_size_bytes * 100).toFixed(1),
    node_count_delta: spi.node_count - legacy.node_count,
    per_prompt: legacy.prompts.map((legacyPrompt, idx) => {
      const spiPrompt = spi.prompts[idx]
      return {
        id: legacyPrompt.id,
        legacy_tokens: legacyPrompt.pack_token_count,
        spi_tokens: spiPrompt?.pack_token_count ?? 0,
        token_delta: (spiPrompt?.pack_token_count ?? 0) - legacyPrompt.pack_token_count,
        legacy_nodes: legacyPrompt.pack_node_count,
        spi_nodes: spiPrompt?.pack_node_count ?? 0,
        legacy_top_labels: legacyPrompt.top_labels,
        spi_top_labels: spiPrompt?.top_labels,
      }
    }),
  }
}

console.log(JSON.stringify(summary, null, 2))
