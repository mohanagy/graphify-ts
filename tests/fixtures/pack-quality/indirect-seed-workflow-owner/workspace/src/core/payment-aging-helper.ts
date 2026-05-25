export function normalizePaymentAgingRetryWindow(paymentId: string) {
  return {
    paymentId,
    retryWindowMinutes: 15,
  }
}
