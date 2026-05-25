import { runWorkflow } from './workflow-runner.js'

export function handleTask(paymentId: string) {
  return runWorkflow(paymentId)
}
