import { describe, expect, it } from 'vitest'

import { AgentSessionMessageEntitySchema } from '../agent'

describe('AgentSessionMessageEntitySchema', () => {
  it('normalizes null metadata to undefined', () => {
    const result = AgentSessionMessageEntitySchema.parse({
      id: 1,
      session_id: 'session_1',
      role: 'user',
      content: { text: 'hello' },
      agent_session_id: 'agent_session_1',
      metadata: null,
      created_at: '2026-03-22T00:00:00.000Z',
      updated_at: '2026-03-22T00:00:00.000Z'
    })

    expect(result.metadata).toBeUndefined()
  })
})
