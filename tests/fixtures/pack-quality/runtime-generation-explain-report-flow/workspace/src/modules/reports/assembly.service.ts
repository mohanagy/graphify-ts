export async function assembleIdeaReport(
  sections: string[],
  researchedSection: { findings: string },
): Promise<{ content: string }> {
  return {
    content: `${sections.join('|')}:${researchedSection.findings}`,
  }
}
