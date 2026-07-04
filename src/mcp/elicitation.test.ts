import { describe, expect, it } from 'vitest'
import { parseElicitationForm } from './elicitation'

describe('MCP elicitation form policy', () => {
  it('accepts bounded JSON objects', () => {
    expect(parseElicitationForm('{"city":"北京"}')).toEqual({ city: '北京' })
  })

  it('rejects arrays, primitives, malformed JSON, and oversized input', () => {
    for (const input of ['[]', 'null', '"secret"', '{']) {
      expect(() => parseElicitationForm(input)).toThrow()
    }
    expect(() => parseElicitationForm(`{"value":"${'x'.repeat(65_536)}"}`)).toThrow('64 KiB')
  })
})
