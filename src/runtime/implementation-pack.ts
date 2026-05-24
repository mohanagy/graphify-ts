import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type {
  ContextPackExecutionSlice,
  ContextPackRuntimeGenerationAnswerContract,
  ImplementationPackFileHint,
  ImplementationPackGuidance,
  ImplementationPackRiskBoundary,
  ImplementationPackSurfaceHint,
} from '../contracts/context-pack.js'
import type { KnowledgeGraph } from '../contracts/graph.js'
import type { TaskIntentKind } from '../contracts/task-intent.js'
import { classifySourceDomain } from '../shared/source-discovery.js'
import { relativizeSourceFile } from '../shared/source-path.js'
import { riskMap } from './risk-map.js'
import type { RetrieveMatchedNode, RetrieveResult } from './retrieve.js'

const CONTRACT_PATH_PATTERN = /(?:^|\/)(?:contracts?|schemas?|dto|types?|interfaces?|openapi|graphql)(?:\/|$)|(?:^|\/)[^/]*\.d\.ts$/i
const CONTRACT_NODE_KINDS = new Set(['interface', 'type', 'type_alias', 'typealias', 'enum', 'schema', 'contract'])
const PUBLIC_SURFACE_NODE_KINDS = new Set(['route', 'router', 'controller', 'page', 'layout', 'middleware'])
const PUBLIC_SURFACE_PATH_PATTERN = /(?:^|\/)(?:cli|stdio)(?:\/|$)|(?:^|\/)(?:http-server|definitions)\.ts$|(?:^|\/)(?:routes?|controllers?|interface\/http)(?:\/|$)/i

type PackageScripts = Record<string, string>

interface BuildImplementationPackOptions {
  budget: number
  taskIntent: TaskIntentKind
  limit?: number
}

interface FileAggregate {
  path: string
  direct_symbols: string[]
  related_symbols: string[]
}

function rootPathFromGraph(graph: KnowledgeGraph): string | undefined {
  return typeof graph.graph.root_path === 'string' && graph.graph.root_path.trim().length > 0
    ? graph.graph.root_path.trim()
    : undefined
}

function groupFiles(
  nodes: readonly RetrieveMatchedNode[],
  rootPath?: string,
): ImplementationPackFileHint[] {
  const byPath = new Map<string, FileAggregate>()

  for (const node of nodes) {
    if (node.source_file.length === 0 || node.relevance_band === 'peripheral') {
      continue
    }

    const path = relativizeSourceFile(node.source_file, rootPath)
    const existing = byPath.get(path) ?? {
      path,
      direct_symbols: [],
      related_symbols: [],
    }
    if (node.relevance_band === 'direct') {
      if (!existing.direct_symbols.includes(node.label)) {
        existing.direct_symbols.push(node.label)
      }
    } else if (!existing.related_symbols.includes(node.label)) {
      existing.related_symbols.push(node.label)
    }
    byPath.set(path, existing)
  }

  return [...byPath.values()].map((entry) => ({
    path: entry.path,
    why: entry.direct_symbols.length > 0
      ? `Direct evidence via ${entry.direct_symbols.slice(0, 3).join(', ')}.`
      : `Supporting context via ${entry.related_symbols.slice(0, 2).join(', ')}.`,
    matched_symbols: [...entry.direct_symbols, ...entry.related_symbols],
  }))
}

function coveredTestNodes(
  graph: KnowledgeGraph,
  retrieval: RetrieveResult,
  rootPath?: string,
): RetrieveMatchedNode[] {
  const derived = new Map<string, RetrieveMatchedNode>()

  for (const node of retrieval.matched_nodes) {
    if (!node.node_id || node.relevance_band === 'peripheral') {
      continue
    }
    if (classifySourceDomain(node.source_file, rootPath) === 'test') {
      continue
    }

    for (const successorId of graph.successors(node.node_id)) {
      const edge = graph.edgeAttributes(node.node_id, successorId)
      if (String(edge.relation ?? '') !== 'covered_by') {
        continue
      }

      const attributes = graph.nodeAttributes(successorId)
      const sourceFile = String(attributes.source_file ?? '')
      if (classifySourceDomain(sourceFile, rootPath) !== 'test') {
        continue
      }

      const label = String(attributes.label ?? successorId)
      const key = `${sourceFile}:${label}`
      if (derived.has(key)) {
        continue
      }

      derived.set(key, {
        node_id: successorId,
        label,
        source_file: sourceFile,
        line_number: 0,
        node_kind: String(attributes.node_kind ?? ''),
        file_type: String(attributes.file_type ?? 'code'),
        snippet: null,
        match_score: Math.max(0.1, node.match_score - 0.1),
        relevance_band: 'related',
        community: typeof attributes.community === 'number' ? attributes.community : null,
        community_label: null,
      })
    }
  }

  return [...derived.values()]
}

function isContractNode(node: RetrieveMatchedNode): boolean {
  return CONTRACT_PATH_PATTERN.test(node.source_file)
    || (typeof node.node_kind === 'string' && CONTRACT_NODE_KINDS.has(node.node_kind.toLowerCase()))
}

function isPublicSurfaceNode(node: RetrieveMatchedNode): boolean {
  const nodeKind = node.node_kind?.toLowerCase() ?? ''
  const frameworkRole = node.framework_role?.toLowerCase() ?? ''
  return PUBLIC_SURFACE_NODE_KINDS.has(nodeKind)
    || frameworkRole.includes('route')
    || frameworkRole.includes('controller')
    || frameworkRole.includes('page')
    || frameworkRole.includes('layout')
    || frameworkRole.includes('middleware')
    || PUBLIC_SURFACE_PATH_PATTERN.test(node.source_file)
}

function pushSurfaceHint(
  seen: Set<string>,
  target: ImplementationPackSurfaceHint[],
  node: RetrieveMatchedNode,
  kind: ImplementationPackSurfaceHint['kind'],
  why: string,
  rootPath?: string,
): void {
  const sourceFile = relativizeSourceFile(node.source_file, rootPath)
  const key = `${kind}:${sourceFile}:${node.label}:${node.line_number}`
  if (seen.has(key)) {
    return
  }
  seen.add(key)
  target.push({
    label: node.label,
    source_file: sourceFile,
    line_number: node.line_number,
    kind,
    why,
  })
}

function buildSurfaceHints(
  retrieval: RetrieveResult,
  editPaths: ReadonlySet<string>,
  rootPath?: string,
): {
  contracts_and_public_surfaces: ImplementationPackSurfaceHint[]
  existing_patterns: ImplementationPackSurfaceHint[]
} {
  const contracts_and_public_surfaces: ImplementationPackSurfaceHint[] = []
  const existing_patterns: ImplementationPackSurfaceHint[] = []
  const surfaceSeen = new Set<string>()
  const patternSeen = new Set<string>()

  for (const node of retrieval.matched_nodes) {
    if (node.relevance_band === 'peripheral') {
      continue
    }

    const sourceFile = relativizeSourceFile(node.source_file, rootPath)
    const sourceDomain = classifySourceDomain(node.source_file, rootPath)
    if (sourceDomain === 'test' || sourceDomain === 'docs' || sourceDomain === 'build_artifact') {
      continue
    }

    if (isContractNode(node)) {
      pushSurfaceHint(surfaceSeen, contracts_and_public_surfaces, node, 'contract', 'Changing this contract can affect implementation callers.', rootPath)
      continue
    }

    if (isPublicSurfaceNode(node)) {
      pushSurfaceHint(surfaceSeen, contracts_and_public_surfaces, node, 'public_surface', 'This is part of the public entry surface touched by the task.', rootPath)
      continue
    }

    if (!editPaths.has(sourceFile)) {
      pushSurfaceHint(patternSeen, existing_patterns, node, 'pattern', 'Existing implementation context worth checking before editing.', rootPath)
    }
  }

  return {
    contracts_and_public_surfaces: contracts_and_public_surfaces.slice(0, 6),
    existing_patterns: existing_patterns.slice(0, 5),
  }
}

function readWorkspacePackageScripts(rootPath?: string): { scripts: PackageScripts; warnings: string[] } {
  if (!rootPath) {
    return { scripts: {}, warnings: ['No workspace root was recorded, so validation commands could not inspect package.json.'] }
  }

  const packageJsonPath = join(rootPath, 'package.json')
  if (!existsSync(packageJsonPath)) {
    return { scripts: {}, warnings: ['No package.json was found in the analyzed workspace root.'] }
  }

  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { scripts?: unknown }
    if (!parsed.scripts || typeof parsed.scripts !== 'object' || Array.isArray(parsed.scripts)) {
      return { scripts: {}, warnings: ['The analyzed workspace package.json does not define scripts for validation commands.'] }
    }

    const scripts = Object.fromEntries(
      Object.entries(parsed.scripts)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0),
    )
    return { scripts, warnings: [] }
  } catch {
    return { scripts: {}, warnings: ['Could not parse the analyzed workspace package.json to derive validation commands.'] }
  }
}

function testCommandForScripts(scripts: PackageScripts, testFiles: readonly string[]): string[] {
  const commands: string[] = []
  if (testFiles.length > 0 && Object.hasOwn(scripts, 'test:run')) {
    commands.push(`npm run test:run -- ${testFiles.slice(0, 5).join(' ')}`)
  }
  if (Object.hasOwn(scripts, 'test:run')) {
    commands.push('npm run test:run')
  } else if (Object.hasOwn(scripts, 'test')) {
    commands.push('npm run test')
  }
  return commands
}

function validationCommands(rootPath: string | undefined, testFiles: readonly ImplementationPackFileHint[]): {
  commands: string[]
  warnings: string[]
} {
  const { scripts, warnings } = readWorkspacePackageScripts(rootPath)
  const commands = [
    ...(Object.hasOwn(scripts, 'typecheck') ? ['npm run typecheck'] : []),
    ...(Object.hasOwn(scripts, 'build') ? ['npm run build'] : []),
    ...testCommandForScripts(scripts, testFiles.map((entry) => entry.path)),
  ]

  return {
    commands: [...new Set(commands)],
    warnings,
  }
}

function acceptanceCriteriaSummary(
  prompt: string,
  editFiles: readonly { path: string }[],
  testFiles: readonly ImplementationPackFileHint[],
  riskBoundaries: readonly ImplementationPackRiskBoundary[],
  contractsAndPublicSurfaces: readonly ImplementationPackSurfaceHint[],
): string[] {
  const requestedChange = prompt.includes(':') ? prompt.split(':').slice(1).join(':').trim() : prompt.trim()
  const summary = [`Implement the requested change: ${requestedChange}.`]

  if (editFiles.length > 0) {
    summary.push(`Update the likely edit surface starting with ${editFiles[0]!.path}.`)
  }
  if (testFiles.length > 0) {
    summary.push(`Keep related tests aligned, including ${testFiles.slice(0, 2).map((entry) => entry.path).join(' and ')}.`)
  }
  if (contractsAndPublicSurfaces.length > 0) {
    summary.push('Keep contracts and public surfaces aligned with the implementation change.')
  }
  if (riskBoundaries.length > 0) {
    summary.push(`Avoid regressions around ${riskBoundaries[0]!.label}.`)
  }

  return summary
}

function cautionMessages(
  retrieval: RetrieveResult,
  riskBoundaries: readonly ImplementationPackRiskBoundary[],
  validationWarnings: readonly string[],
  testFiles: readonly ImplementationPackFileHint[],
): string[] {
  const cautions: string[] = []

  if ((retrieval.coverage?.missing_required.length ?? 0) > 0) {
    cautions.push(`Missing required context: ${retrieval.coverage!.missing_required.join(', ')}.`)
  }
  if ((retrieval.coverage?.missing_semantic.length ?? 0) > 0) {
    cautions.push(`Missing semantic coverage: ${retrieval.coverage!.missing_semantic.join(', ')}.`)
  }
  for (const risk of riskBoundaries.filter((entry) => entry.severity === 'high').slice(0, 2)) {
    cautions.push(`High-risk shared boundary: ${risk.label} affects ${risk.affected_files.length} files.`)
  }
  if (testFiles.length === 0) {
    cautions.push('No related tests were retrieved; validate regression coverage manually.')
  }

  return [...new Set([...cautions, ...validationWarnings])]
}

function runtimeContext(
  executionSlice: ContextPackExecutionSlice | undefined,
  answerContract: ContextPackRuntimeGenerationAnswerContract | undefined,
): ImplementationPackGuidance['runtime_context_if_relevant'] | undefined {
  if (!executionSlice && !answerContract) {
    return undefined
  }

  return {
    summary: 'Runtime flow context was included because the retrieved implementation surface contains execution-path evidence.',
    ...(executionSlice ? { execution_slice: executionSlice } : {}),
    ...(answerContract ? { answer_contract: answerContract } : {}),
  }
}

export function buildImplementationPackGuidance(
  graph: KnowledgeGraph,
  retrieval: RetrieveResult,
  options: BuildImplementationPackOptions,
): ImplementationPackGuidance {
  const rootPath = rootPathFromGraph(graph)
  const risk = riskMap(graph, {
    question: retrieval.question,
    budget: options.budget,
    limit: options.limit ?? 5,
    fileType: 'code',
    taskKind: 'implement',
    taskIntent: options.taskIntent,
  })
  const relatedTestNodes = coveredTestNodes(graph, retrieval, rootPath)
  const likely_test_files = groupFiles(
    [
      ...retrieval.matched_nodes.filter((node) => classifySourceDomain(node.source_file, rootPath) === 'test'),
      ...relatedTestNodes,
    ],
    rootPath,
  ).slice(0, options.limit ?? 5)
  const editPaths = new Set(risk.starter_files.map((entry) => entry.path))
  const { contracts_and_public_surfaces, existing_patterns } = buildSurfaceHints(retrieval, editPaths, rootPath)
  const validation = validationCommands(rootPath, likely_test_files)
  const risk_boundaries: ImplementationPackRiskBoundary[] = risk.top_risks
  const summary = risk.starter_files[0]
    ? `Start with ${risk.starter_files[0].path}, then validate the highest-risk shared boundaries before finishing.`
    : risk.summary
  const runtimeContextIfRelevant = runtimeContext(retrieval.execution_slice, retrieval.answer_contract)

  return {
    summary,
    likely_edit_files: risk.starter_files.slice(0, options.limit ?? 5).map((entry) => ({
      path: entry.path,
      why: entry.why,
      matched_symbols: entry.matched_symbols,
    })),
    likely_test_files,
    contracts_and_public_surfaces,
    existing_patterns,
    risk_boundaries,
    validation_commands: validation.commands,
    acceptance_criteria_summary: acceptanceCriteriaSummary(
      retrieval.question,
      risk.starter_files,
      likely_test_files,
      risk_boundaries,
      contracts_and_public_surfaces,
    ),
    cautions: cautionMessages(retrieval, risk_boundaries, validation.warnings, likely_test_files),
    ...(runtimeContextIfRelevant ? { runtime_context_if_relevant: runtimeContextIfRelevant } : {}),
  }
}
