import { ResearchAgentService } from '../research-agent.service.js'

const researchAgentService = new ResearchAgentService()

export async function processIdeaReportSection(section: string): Promise<{ section: string; findings: string }> {
  const research = await researchAgentService.searchIdeaReportSources(section)
  return {
    section,
    findings: research.summary,
  }
}
