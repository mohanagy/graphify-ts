export type PipelineJobPayload = {
  userId: string
  problem: string
  ideaId: string
}

class PipelineQueue {
  async add(
    jobName: string,
    input: PipelineJobPayload,
  ): Promise<{ id: string }> {
    return {
      id: `${input.userId}:${input.problem}:${input.ideaId}:${jobName}`,
    }
  }
}

const pipelineQueue = new PipelineQueue()

export async function enqueueIdeaReportJob(input: PipelineJobPayload): Promise<{ jobId: string }> {
  const job = await pipelineQueue.add('pipeline.orchestrator.process', input)
  return {
    jobId: job.id,
  }
}
