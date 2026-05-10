import { describe, expect, it } from 'vitest'

import type {
  CompiledContextPack,
  ContextPackNode,
  ContextPackRelationship,
} from '../../src/contracts/context-pack.js'
import {
  collectPackNodeIds,
  computeDeltaContextPack,
} from '../../src/runtime/context-pack-delta.js'

function node(id: string, label: string): ContextPackNode {
  return {
    node_id: id,
    label,
    source_file: `src/${label}.ts`,
    line_number: 1,
    snippet: null,
    file_type: 'code',
  }
}

function relationship(
  fromId: string,
  toId: string,
  fromLabel: string,
  toLabel: string,
  relation = 'calls',
): ContextPackRelationship {
  return { from_id: fromId, to_id: toId, from: fromLabel, to: toLabel, relation }
}

function pack(nodes: ContextPackNode[], rels: ContextPackRelationship[] = []): CompiledContextPack {
  return {
    task_contract: {
      version: 1,
      task_kind: 'explain',
      evidence_recipe_id: 'explain',
      budget: 1000,
      required_evidence: [],
      preferred_evidence: [],
      semantic_required: [],
      semantic_optional: [],
    },
    token_count: 100,
    nodes,
    relationships: rels,
    community_context: [],
    claims: [],
    expandable: [],
    coverage: {
      required_evidence: [],
      semantic_required: [],
      semantic_optional: [],
      entries: [],
      semantic_entries: [],
      missing_required: [],
      missing_semantic: [],
      available_relationships: rels.length,
      selected_relationships: rels.length,
    },
  }
}

describe('computeDeltaContextPack (#81)', () => {
  it('returns the input pack unchanged when there are no previously-sent ids', () => {
    const original = pack([node('a', 'A'), node('b', 'B')])
    const result = computeDeltaContextPack(original, [])
    expect(result.delta_applied).toBe(false)
    expect(result.delta_pack).toBe(original)
    expect(result.referenced_ids).toEqual([])
    expect(result.bytes_saved).toBe(0)
  })

  it('drops nodes whose node_id is in the previously-sent set and surfaces them as references', () => {
    const original = pack([node('a', 'A'), node('b', 'B'), node('c', 'C')])
    const result = computeDeltaContextPack(original, ['a', 'c'])
    expect(result.delta_applied).toBe(true)
    expect(result.delta_pack.nodes.map((n) => n.node_id)).toEqual(['b'])
    expect(result.referenced_ids.sort()).toEqual(['a', 'c'])
    expect(result.bytes_saved).toBeGreaterThan(0)
  })

  it('drops relationships whose endpoints are now referenced (the receiver already has them)', () => {
    const original = pack(
      [node('a', 'A'), node('b', 'B'), node('c', 'C')],
      [
        relationship('a', 'b', 'A', 'B'), // both new — keep
        relationship('a', 'c', 'A', 'C'), // c is referenced — drop
        relationship('b', 'c', 'B', 'C'), // c is referenced — drop
      ],
    )
    const result = computeDeltaContextPack(original, ['c'])
    expect(result.delta_pack.relationships).toHaveLength(1)
    expect(result.delta_pack.relationships[0]?.from_id).toBe('a')
    expect(result.delta_pack.relationships[0]?.to_id).toBe('b')
  })

  it('passes through nodes that have no node_id (cannot be deduplicated by handle)', () => {
    const noIdNode: ContextPackNode = {
      label: 'NoId',
      source_file: 'src/x.ts',
      line_number: 1,
      snippet: null,
    }
    const result = computeDeltaContextPack(pack([noIdNode, node('a', 'A')]), ['a'])
    expect(result.delta_pack.nodes.map((n) => n.label)).toEqual(['NoId'])
  })

  it('reports zero bytes_saved when there is no overlap', () => {
    const original = pack([node('a', 'A'), node('b', 'B')])
    const result = computeDeltaContextPack(original, ['x', 'y'])
    expect(result.delta_applied).toBe(false)
    expect(result.bytes_saved).toBe(0)
  })
})

describe('collectPackNodeIds (#81)', () => {
  it('returns every node_id present on the pack nodes', () => {
    const ids = collectPackNodeIds(pack([node('a', 'A'), node('b', 'B')]))
    expect(ids.sort()).toEqual(['a', 'b'])
  })

  it('skips nodes without a node_id', () => {
    const noIdNode: ContextPackNode = {
      label: 'NoId',
      source_file: 'src/x.ts',
      line_number: 1,
      snippet: null,
    }
    const ids = collectPackNodeIds(pack([noIdNode, node('a', 'A')]))
    expect(ids).toEqual(['a'])
  })
})
