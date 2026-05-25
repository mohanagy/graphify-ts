import { enqueueIdeaReportJob } from './queue-registry.service.js'

export async function startIdeaReportPipeline(
  userId: string,
  problem: string,
  ideaId: string,
): Promise<{ jobId: string }> {
  return enqueueIdeaReportJob({ userId, problem, ideaId })
}
