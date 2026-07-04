import { describe, expect, it } from 'vitest'

import { toAgentError } from './events'

describe('agent error normalization', () => {
  it('preserves structured backend errors', () => {
    expect(
      toAgentError({
        kind: 'rate_limit',
        message: 'Too many requests',
        retryable: true,
      }),
    ).toEqual({
      code: 'rate_limit',
      message: 'Too many requests',
      category: 'rate-limit',
      retryable: true,
    })
  })
})
