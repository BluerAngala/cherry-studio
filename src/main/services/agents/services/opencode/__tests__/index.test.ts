import { describe, expect, it } from 'vitest'

import { parseOpenCodeModel, resolveStreamingDelta } from '../index'

describe('OpenCodeService helpers', () => {
  it('parses provider and model id using the first separator', () => {
    expect(parseOpenCodeModel('silicon:Qwen/Qwen3-8B')).toEqual({
      providerID: 'silicon',
      modelID: 'Qwen/Qwen3-8B'
    })
  })

  it('returns the explicit streaming delta when provided', () => {
    expect(resolveStreamingDelta('hello', 'hello world', ' world')).toBe(' world')
  })

  it('derives appended text when the server only returns snapshots', () => {
    expect(resolveStreamingDelta('hello', 'hello world')).toBe(' world')
  })

  it('falls back to the latest snapshot when content does not extend cleanly', () => {
    expect(resolveStreamingDelta('hello', 'goodbye')).toBe('goodbye')
  })
})
