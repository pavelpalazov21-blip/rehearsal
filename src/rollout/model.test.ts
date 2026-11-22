import { describe, it, expect } from 'vitest'
import {
  baseline,
  bucketFor,
  evaluate,
  makeRelease,
  parseCommand,
  sameRequest,
  sample,
  mergeHistory,
  type Command,
} from './model'
const first: Command = {
  base: 0,
  kind: 'publish',
  percent: 25,
  requestId: '00000000-0000-4000-8000-000000000001',
  note: 'Pilot',
}
describe('cohort assignment', () => {
  it('keeps known customer buckets stable across releases', () => {
    expect(
      ['shopper-001', 'shopper-002', 'shopper-003'].map((k) => bucketFor(k)),
    ).toEqual([7562, 1749, 3810])
    expect(evaluate('shopper-002', { revision: 1, percent: 25 }).enabled).toBe(
      true,
    )
    expect(evaluate('shopper-001', { revision: 1, percent: 25 }).enabled).toBe(
      false,
    )
  })
  it('includes none at zero and all at 100, and only grows between them', () => {
    for (const s of sample) {
      let included = false
      expect(evaluate(s.customer, baseline).enabled).toBe(false)
      for (let percent = 1; percent <= 100; percent++) {
        const next = evaluate(s.customer, { revision: 1, percent }).enabled
        if (included) expect(next).toBe(true)
        included = next
      }
      expect(included).toBe(true)
    }
  })
})
describe('release journal', () => {
  it('restores the selected policy as a new revision', () => {
    const one = {
      ...makeRelease(first, baseline),
      createdAt: '2026-11-21T00:00:00Z',
    }
    const two = makeRelease(
      {
        base: 1,
        requestId: crypto.randomUUID(),
        kind: 'restore',
        target: 0,
        note: '',
      },
      one,
      baseline,
    )
    expect(two).toMatchObject({
      revision: 2,
      previous: 25,
      percent: 0,
      target: 0,
    })
    expect(evaluate('shopper-002', two).enabled).toBe(false)
  })
  it('rejects a no-op, an invalid rollback target and an outdated base', () => {
    expect(() => makeRelease({ ...first, percent: 0 }, baseline)).toThrow()
    expect(() => makeRelease({ ...first, base: 4 }, baseline)).toThrow()
    expect(parseCommand({ ...first, kind: 'restore', target: 0 })).toBeNull()
  })
  it('validates percentage, reason and request key at the boundary', () => {
    expect(parseCommand(first)).toEqual(first)
    for (const invalid of [
      { percent: 2.5 },
      { percent: 101 },
      { percent: -1 },
      { note: 'x'.repeat(161) },
      { base: -1 },
      { requestId: 'nope' },
    ])
      expect(parseCommand({ ...first, ...invalid })).toBeNull()
  })
  it('matches retries precisely and ignores late websocket duplicates', () => {
    const row = {
      ...makeRelease(first, baseline),
      createdAt: '2026-11-21T00:00:00Z',
    }
    expect(sameRequest(row, first)).toBe(true)
    expect(sameRequest(row, { ...first, note: 'different' })).toBe(false)
    const history = [row]
    expect(mergeHistory(history, [row])).toBe(history)
  })
})
