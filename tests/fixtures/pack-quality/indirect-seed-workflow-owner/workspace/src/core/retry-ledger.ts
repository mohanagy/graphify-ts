export function storeRetryWindow(entry: { paymentId: string; retryWindowMinutes: number }) {
  return {
    ...entry,
    stored: true,
  }
}
