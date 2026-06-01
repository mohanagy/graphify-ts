export interface ContextSessionStoredRef {
  hash: string
  token_count: number
}

export interface ContextSessionState {
  version: 1
  revision: number
  refs: Record<string, ContextSessionStoredRef>
}

export interface ContextSessionDeltaRef {
  ref: string
  hash: string
  token_count: number
  content: string
}

export interface ContextSessionDelta {
  version: 1
  previous_revision: number | null
  next_revision: number
  added: ContextSessionDeltaRef[]
  updated: ContextSessionDeltaRef[]
  invalidated: string[]
  reused_refs: string[]
  reused_token_count: number
}

export interface ContextSessionDiagnostics {
  mode: 'initial' | 'follow_up'
  previous_revision: number | null
  reused_refs: string[]
  added_refs: string[]
  updated_refs: string[]
  invalidated_refs: string[]
  reused_context_tokens: number
  effective_token_count: number
}
