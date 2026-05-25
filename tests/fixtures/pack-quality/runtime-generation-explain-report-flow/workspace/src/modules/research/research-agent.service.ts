export class ResearchAgentService {
  async searchIdeaReportSources(section: string): Promise<{ summary: string }> {
    return {
      summary: `researched:${section}`,
    }
  }
}
