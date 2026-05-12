export interface ReportFooterProps {
  generatedAt?: string | null
  pipelineLabel?: string | null
}

export function pickGeneratedAt(props: ReportFooterProps): string {
  return props.generatedAt ?? 'Not generated yet'
}

export function pickPipelineLabel(props: ReportFooterProps): string {
  return props.pipelineLabel ?? 'Pipeline status unavailable'
}

export function ReportFooter(props: ReportFooterProps): string {
  return `${pickGeneratedAt(props)} · ${pickPipelineLabel(props)}`
}
