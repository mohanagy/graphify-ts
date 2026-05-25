import { normalizePaymentAgingRetryWindow } from './payment-aging-helper.js'
import { storeRetryWindow } from './retry-ledger.js'

export function runWorkflow(paymentId: string) {
  const retryWindow = normalizePaymentAgingRetryWindow(paymentId)
  return storeRetryWindow(retryWindow)
}
