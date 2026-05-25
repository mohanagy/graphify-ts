export async function saveStructuredReport(
  ideaId: string,
  report: { content: string },
): Promise<{ saved: boolean }> {
  return { saved: ideaId.length > 0 && report.content.length > 0 }
}
