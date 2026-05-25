export function generateIdeaReportSuggestedNextSteps(problem: string): string[] {
  return [`review:${problem}`, 'share-report']
}
