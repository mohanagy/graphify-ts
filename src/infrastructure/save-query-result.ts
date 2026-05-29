import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export interface SaveQueryOptions {
  queryType?: string
  sourceNodes?: string[]
}

const MAX_SOURCE_NODES = 10

function yamlString(value: string): string {
  return JSON.stringify(value.replace(/[\r\n]+/g, ' '))
}

function timestampSlug(date: Date): string {
  const parts = [date.getUTCFullYear().toString().padStart(4, '0'), (date.getUTCMonth() + 1).toString().padStart(2, '0'), date.getUTCDate().toString().padStart(2, '0')]
  const time = [date.getUTCHours().toString().padStart(2, '0'), date.getUTCMinutes().toString().padStart(2, '0'), date.getUTCSeconds().toString().padStart(2, '0')]
  return `${parts.join('')}_${time.join('')}`
}

function questionSlug(question: string): string {
  return (
    question
      .toLowerCase()
      .replace(/[^\w]/g, '_')
      .slice(0, 50)
      .replace(/^_+|_+$/g, '') || 'query'
  )
}

function ensureUniquePath(directory: string, fileName: string): string {
  let candidate = join(directory, fileName)
  let counter = 1
  while (existsSync(candidate)) {
    const extensionIndex = fileName.lastIndexOf('.')
    const stem = extensionIndex >= 0 ? fileName.slice(0, extensionIndex) : fileName
    const extension = extensionIndex >= 0 ? fileName.slice(extensionIndex) : ''
    candidate = join(directory, `${stem}_${counter}${extension}`)
    counter += 1
  }
  return candidate
}

export function saveQueryResult(question: string, answer: string, memoryDir: string, options: SaveQueryOptions = {}): string {
  const directory = resolve(memoryDir)
  mkdirSync(directory, { recursive: true })

  const now = new Date()
  const outputPath = ensureUniquePath(directory, `query_${timestampSlug(now)}_${questionSlug(question)}.md`)
  const sourceNodes = options.sourceNodes?.slice(0, MAX_SOURCE_NODES) ?? []
  const lines = [
    '---',
    `type: ${yamlString(options.queryType ?? 'query')}`,
    `date: ${yamlString(now.toISOString())}`,
    `question: ${yamlString(question)}`,
    `contributor: ${yamlString('madar')}`,
    ...(sourceNodes.length > 0 ? [`source_nodes: [${sourceNodes.map((node) => yamlString(node)).join(', ')}]`] : []),
    '---',
    '',
    `# Q: ${question}`,
    '',
    '## Answer',
    '',
    answer,
  ]

  if (sourceNodes.length > 0) {
    lines.push('', '## Source Nodes', '')
    for (const node of sourceNodes) {
      lines.push(`- ${node}`)
    }
  }

  writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8')
  return outputPath
}
