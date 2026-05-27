interface RoutingRow {
  promptType: string
  markdownTarget: string
  plainPromptType?: string
  plainTarget: string
}

const MCP_ROUTING_ROWS: RoutingRow[] = [
  {
    promptType: '"how does X work" / explain runtime / flow',
    markdownTarget: '`context_pack`',
    plainPromptType: '"how does X work?" / explain runtime / flow',
    plainTarget: 'context_pack',
  },
  {
    promptType: '"what breaks if I change X" / impact analysis',
    markdownTarget: '`impact`',
    plainPromptType: '"what breaks if I change X?" / impact analysis',
    plainTarget: 'impact',
  },
  {
    promptType: '"which files should I open first"',
    markdownTarget: '`relevant_files`',
    plainPromptType: '"which files should I open first?"',
    plainTarget: 'relevant_files',
  },
  {
    promptType: '"give me a repo overview"',
    markdownTarget: '`graph_summary`',
    plainPromptType: '"give me a repo overview?"',
    plainTarget: 'graph_summary',
  },
  {
    promptType: '"what parts are involved in feature X"',
    markdownTarget: '`feature_map`',
    plainTarget: 'feature_map',
  },
  {
    promptType: '"what\'s risky to edit in X"',
    markdownTarget: '`risk_map`',
    plainTarget: 'risk_map',
  },
  {
    promptType: '"give me a build/edit checklist"',
    markdownTarget: '`implementation_checklist`',
    plainTarget: 'implementation_checklist',
  },
  {
    promptType: 'general retrieval / list of nodes',
    markdownTarget: '`retrieve`',
    plainTarget: 'retrieve',
  },
]

const CODEX_ROUTING_ROWS: RoutingRow[] = [
  {
    promptType: '"how does X work" / explain runtime / flow',
    markdownTarget: '`madar pack "<task or question>" --task explain`',
    plainPromptType: '"how does X work?" / explain runtime / flow',
    plainTarget: 'madar pack "<task or question>" --task explain',
  },
  {
    promptType: '"what breaks if I change X" / impact analysis',
    markdownTarget: '`madar pack "<task or question>" --task impact`',
    plainPromptType: '"what breaks if I change X?" / impact analysis',
    plainTarget: 'madar pack "<task or question>" --task impact',
  },
  {
    promptType: '"which files should I open first"',
    markdownTarget: '`relevant_files` when MCP graph tools are available; otherwise `madar pack "<task or question>" --task explain`',
    plainPromptType: '"which files should I open first?"',
    plainTarget: 'relevant_files when MCP graph tools are available',
  },
  {
    promptType: '"give me a repo overview"',
    markdownTarget: '`graph_summary` when MCP graph tools are available; otherwise `madar pack "<task or question>" --task explain`',
    plainPromptType: '"give me a repo overview?"',
    plainTarget: 'graph_summary when MCP graph tools are available',
  },
]

function renderMarkdownTable(lead: string, rows: RoutingRow[], toolSearchSentence: string): string {
  const lines = [
    lead,
    '',
    '| Prompt type | First tool |',
    '| --- | --- |',
    ...rows.map((row) => `| ${row.promptType} | ${row.markdownTarget} |`),
    '',
    toolSearchSentence,
  ]
  return lines.join('\n')
}

function renderPlainGuide(
  lead: string,
  rows: RoutingRow[],
  toolSearchSentence: string,
): string {
  const rules = rows.map((row) => `${row.plainTarget} for ${row.plainPromptType ?? row.promptType}`).join('; ')
  return `${lead}: ${rules}. ${toolSearchSentence}`
}

export function renderMarkdownMcpRoutingTable(): string {
  return renderMarkdownTable(
    'For each codebase question, use the specific Madar MCP tool below first:',
    MCP_ROUTING_ROWS,
    'Do not run ToolSearch before calling a Madar tool — the tool names above are stable. Pick the one that matches and call it directly.',
  )
}

export function renderPlainMcpRoutingGuide(): string {
  return renderPlainGuide(
    'For each codebase question, call the matching Madar MCP tool directly first',
    MCP_ROUTING_ROWS,
    'Do not run ToolSearch before calling a Madar tool — the tool names above are stable. Pick the one that matches and call it directly.',
  )
}

export function renderMarkdownCodexRoutingTable(): string {
  return renderMarkdownTable(
    'For each codebase question, start with the specific Madar command below first:',
    CODEX_ROUTING_ROWS,
    'Do not run ToolSearch before calling a Madar command or graph tool — pick the matching command first, then refine with MCP graph tools only when they are available and still needed.',
  )
}

export function renderPlainCodexRoutingGuide(): string {
  return renderPlainGuide(
    'For each codebase question, start with the specific Madar command below first',
    CODEX_ROUTING_ROWS,
    'Do not run ToolSearch before calling a Madar command or graph tool — pick the matching command first, then refine with MCP graph tools only when they are available and still needed.',
  )
}
