import { existsSync, realpathSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'

export interface ShareSafePathRoots {
  artifactRoot: string
  projectRoot: string
}

const URL_TOKEN_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'`<>]+/gi
const PATH_SEGMENT_PATTERN = String.raw`[^\s"'<>\\/]+(?: [^\s"'<>\\/]+)*`
const RELATIVE_TRAVERSAL_SEGMENT_PATTERN = PATH_SEGMENT_PATTERN
const ABSOLUTE_PATH_TOKEN_PATTERN = new RegExp(
  String.raw`(?<!<artifact-root>)(?<!<project-root>)(?:[A-Za-z]:[\\/](?:${PATH_SEGMENT_PATTERN}(?:[\\/]+${PATH_SEGMENT_PATTERN})*)?|\/(?:${PATH_SEGMENT_PATTERN}(?:[\\/]+${PATH_SEGMENT_PATTERN})*)?)`,
  'g',
)
const RELATIVE_TRAVERSAL_TOKEN_PATTERN = new RegExp(
  String.raw`(?:\.\.[\\/]+)+(?:${RELATIVE_TRAVERSAL_SEGMENT_PATTERN}(?:[\\/]+${RELATIVE_TRAVERSAL_SEGMENT_PATTERN})*)?`,
  'g',
)
const TRAILING_PATH_PUNCTUATION = new Set([',', '.', ':', ';', ')', ']', '}'])
const URL_PLACEHOLDER_PREFIX = '__GRAPHIFY_SHARE_SAFE_URL__'

function sameResolvedPath(path: string, root: string): boolean {
  return resolve(path) === resolve(root)
}

function isWithinRoot(path: string, root: string): boolean {
  const resolvedRoot = resolve(root)
  const resolvedPath = resolve(path)
  const rootPrefix = resolvedRoot.endsWith(sep) ? resolvedRoot : `${resolvedRoot}${sep}`
  return resolvedPath.startsWith(rootPrefix)
}

function toPortableShareSafeSuffix(path: string): string {
  return path.split(sep).join('/')
}

function addPathAlias(path: string, aliases: Set<string>): void {
  aliases.add(resolve(path))
  if (path.startsWith('/private/')) {
    aliases.add(path.slice('/private'.length))
  } else if (path.startsWith('/var/')) {
    aliases.add(`/private${path}`)
  }

  try {
    const realPath = realpathSync(path)
    aliases.add(realPath)
    if (realPath.startsWith('/private/')) {
      aliases.add(realPath.slice('/private'.length))
    } else if (realPath.startsWith('/var/')) {
      aliases.add(`/private${realPath}`)
    }
  } catch {
    // Ignore paths that do not exist when building aliases.
  }
}

function rootAliases(root: string): string[] {
  const aliases = new Set<string>()
  addPathAlias(root, aliases)
  return [...aliases].sort((left, right) => right.length - left.length)
}

function replaceRootPrefix(path: string, root: string, placeholder: '<artifact-root>' | '<project-root>'): string | null {
  if (path === root) {
    return placeholder
  }

  const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`
  if (!path.startsWith(rootPrefix)) {
    return null
  }

  return `${placeholder}/${toPortableShareSafeSuffix(path.slice(rootPrefix.length))}`
}

function toShareSafeRootedPath(path: string, roots: ShareSafePathRoots): string | null {
  if (sameResolvedPath(path, roots.artifactRoot) || isWithinRoot(path, roots.artifactRoot)) {
    return replaceRootPrefix(resolve(path), resolve(roots.artifactRoot), '<artifact-root>') ?? '<artifact-root>'
  }
  for (const alias of rootAliases(roots.artifactRoot)) {
    const replaced = replaceRootPrefix(path, alias, '<artifact-root>')
    if (replaced !== null) return replaced
  }

  if (sameResolvedPath(path, roots.projectRoot) || isWithinRoot(path, roots.projectRoot)) {
    return replaceRootPrefix(resolve(path), resolve(roots.projectRoot), '<project-root>') ?? '<project-root>'
  }
  for (const alias of rootAliases(roots.projectRoot)) {
    const replaced = replaceRootPrefix(path, alias, '<project-root>')
    if (replaced !== null) return replaced
  }

  return null
}

function splitTrailingPathPunctuation(token: string): { path: string; suffix: string } {
  let end = token.length
  while (end > 0 && TRAILING_PATH_PUNCTUATION.has(token[end - 1] ?? '')) {
    end -= 1
  }
  return {
    path: token.slice(0, end),
    suffix: token.slice(end),
  }
}

function externalPathFallback(path: string): string {
  const normalizedPath = path.replaceAll('\\', '/')
  const lastSegment = normalizedPath.split('/').pop()
  return lastSegment && lastSegment.length > 0 ? lastSegment : '<external-path>'
}

function isWithinShareSafeRootedToken(text: string, offset: number): boolean {
  const boundary = Math.max(
    text.lastIndexOf('\n', offset - 1),
    text.lastIndexOf('\r', offset - 1),
    text.lastIndexOf('\t', offset - 1),
    text.lastIndexOf('"', offset - 1),
    text.lastIndexOf("'", offset - 1),
    text.lastIndexOf('`', offset - 1),
  )
  const tokenPrefix = text.slice(boundary + 1, offset)
  const placeholderIndex = Math.max(tokenPrefix.lastIndexOf('<artifact-root>'), tokenPrefix.lastIndexOf('<project-root>'))
  if (placeholderIndex < 0) return false
  return /^<(?:artifact-root|project-root)>(?:\/[^"'`<>\r\n\t]*)?$/.test(tokenPrefix.slice(placeholderIndex))
}

export function toShareSafeArtifactPath(path: string, roots: ShareSafePathRoots): string {
  const rewrittenPath = toShareSafeRootedPath(path, roots)
  if (rewrittenPath !== null) return rewrittenPath
  return externalPathFallback(path)
}

function resolveRelativeTraversalPath(path: string, roots: ShareSafePathRoots): string | null {
  for (const candidate of [resolve(roots.projectRoot, path), resolve(roots.artifactRoot, path)]) {
    if (!existsSync(candidate)) continue

    const rewrittenPath = toShareSafeRootedPath(candidate, roots)
    if (rewrittenPath !== null) return rewrittenPath
  }

  return null
}

function sanitizeRelativeTraversalPath(path: string, roots: ShareSafePathRoots): string {
  const rewrittenPath = resolveRelativeTraversalPath(path, roots)
  if (rewrittenPath !== null) return rewrittenPath
  return externalPathFallback(path)
}

function sanitizeRelativeTraversalToken(token: string, roots: ShareSafePathRoots): string {
  const { path, suffix } = splitTrailingPathPunctuation(token)
  const rewrittenPath = resolveRelativeTraversalPath(path, roots)
  if (rewrittenPath !== null) return `${rewrittenPath}${suffix}`

  let matchedPrefix = ''
  let matchedRewrite: string | null = null
  for (let index = 0; index < path.length; index += 1) {
    if (path[index] !== ' ') continue
    const candidatePath = path.slice(0, index)
    const candidateRewrite = resolveRelativeTraversalPath(candidatePath, roots)
    if (candidateRewrite === null) continue
    matchedPrefix = candidatePath
    matchedRewrite = candidateRewrite
  }

  if (matchedRewrite !== null) {
    return `${matchedRewrite}${path.slice(matchedPrefix.length)}${suffix}`
  }

  return `${sanitizeRelativeTraversalPath(path, roots)}${suffix}`
}

export function sanitizeShareSafeText(text: string, roots: ShareSafePathRoots): string {
  const urls: string[] = []
  const protectedText = text.replace(URL_TOKEN_PATTERN, (url) => {
    const placeholder = `${URL_PLACEHOLDER_PREFIX}${urls.length}__`
    urls.push(url)
    return placeholder
  })

  const traversalSanitizedText = protectedText.replace(RELATIVE_TRAVERSAL_TOKEN_PATTERN, (token) =>
    sanitizeRelativeTraversalToken(token, roots),
  )

  const sanitizedText = traversalSanitizedText.replace(ABSOLUTE_PATH_TOKEN_PATTERN, (token, offset, source) => {
    if (isWithinShareSafeRootedToken(source, offset)) {
      return token
    }
    const { path, suffix } = splitTrailingPathPunctuation(token)
    const rewrittenPath = toShareSafeRootedPath(path, roots)
    return rewrittenPath === null ? `${externalPathFallback(path)}${suffix}` : `${rewrittenPath}${suffix}`
  })

  return sanitizedText.replace(new RegExp(`${URL_PLACEHOLDER_PREFIX}(\\d+)__`, 'g'), (_placeholder, index) => {
    return urls[Number(index)] ?? ''
  })
}
