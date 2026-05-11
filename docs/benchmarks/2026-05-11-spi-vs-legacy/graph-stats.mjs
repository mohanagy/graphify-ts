#!/usr/bin/env node

import { readFileSync } from 'node:fs'

const graphPath = process.argv[2]
if (!graphPath) {
  console.error('usage: graph-stats.mjs <graph.json>')
  process.exit(2)
}

const graph = JSON.parse(readFileSync(graphPath, 'utf8'))
const nodeCount = Array.isArray(graph.nodes) ? graph.nodes.length : 0
const edgeCount = Array.isArray(graph.edges) ? graph.edges.length : 0

console.log(JSON.stringify({
  node_count: nodeCount,
  edge_count: edgeCount,
}))
