import { describe, expect, it } from 'vitest'

import { runWorkflow } from '../../src/core/workflow-runner.js'

describe('runWorkflow', () => {
  it('stores the normalized retry window', () => {
    expect(runWorkflow('pay-1')).toEqual({
      paymentId: 'pay-1',
      retryWindowMinutes: 15,
      stored: true,
    })
  })
})
