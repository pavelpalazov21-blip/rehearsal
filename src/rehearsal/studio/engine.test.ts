/// <reference types="node" />
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { DomainError } from '../room-state.ts'
import { hashInvitation } from '../room-state.ts'
import { SCENARIOS, scenarioIds } from './scenarios.ts'
import type { ScenarioId } from './scenarios.ts'
import { checkJavaScript, checkConfiguration } from './repair.ts'
import {
  StudioRepository,
  actStudio,
  claimStudioSeat,
  createNewStudioRoom,
  studioEvidence,
  studioView,
  postStudioMessage,
} from './engine.ts'
import type { StudioState, StudioCommand, StudioActionInput } from './engine.ts'
const SOLVED: Record<ScenarioId, string> = {
  checkout:
    'function canAcceptPayment(order, previousIds) { return order.id !== "" && order.amount > 0 && order.currency === "USD" && !previousIds.includes(order.id); }',
  surge:
    'function shouldQueue(requestRate, capacity, queueEnabled) { return queueEnabled === true && requestRate > capacity; }',
  security:
    'function canRead(token, now) { return token.active === true && token.compromised === false && token.expiresAt > now && token.scope === "read-only"; }',
  'ai-agent':
    'function approvePriceChange(change) { return change.approved === true && change.source === "verified" && change.percentChange >= -10 && change.percentChange <= 10; }',
  duplicates:
    'function shouldCharge(event, processedIds) { return event.id !== "" && event.amount > 0 && !processedIds.includes(event.id); }',
  database:
    'function readTarget(replicaLag, maxLag, replicaHealthy) { return replicaHealthy === true && replicaLag >= 0 && replicaLag <= maxLag ? "replica" : "primary"; }',
  notification:
    'function shouldNotify(person, campaign) { return person.affected === true && person.optedOut === false && campaign.approved === true && campaign.paused === false; }',
}
export function solvedConfig(id: ScenarioId): string {
  const spec = SCENARIOS[id].config,
    config = { ...spec.starter }
  for (const r of spec.rules) {
    if (r.op === 'eq') config[r.field] = r.value
    else if (r.op === 'gte')
      config[r.field] = Math.max(Number(config[r.field]), Number(r.value))
    else if (r.op === 'lte')
      config[r.field] = Math.min(Number(config[r.field]), Number(r.value))
    else if (r.op === 'between') config[r.field] = Number(r.value)
    else if (r.op === 'leFieldMinus')
      config[r.field] = Math.min(
        Number(config[r.field]),
        Number(config[String(r.value)]) - (r.extra ?? 0),
      )
  }
  return JSON.stringify(config, null, 2)
}
function dbFixture() {
  const db = new DatabaseSync(':memory:')
  const repo = new StudioRepository({
    sql: {
      exec(sql: string, ...bindings: (string | number | null)[]) {
        const stmt = db.prepare(sql)
        return /^\s*SELECT/i.test(sql)
          ? stmt.all(...bindings)
          : (stmt.run(...bindings), [])
      },
    },
    transactionSync<T>(fn: () => T) {
      db.exec('BEGIN IMMEDIATE')
      try {
        const result = fn()
        db.exec('COMMIT')
        return result
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
  })
  return { db, repo }
}
async function create(id: ScenarioId, mode: 'solo' | 'team' = 'solo') {
  const roomId = `rh-${id.replace(/-/g, '')}-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
  return {
    roomId,
    ...(await createNewStudioRoom(
      roomId,
      'host-user',
      id,
      mode,
      new Date().toISOString(),
    )),
  }
}
function step(
  repo: StudioRepository,
  id: string,
  actor: string,
  type: StudioCommand,
  extras: Partial<StudioActionInput> = {},
) {
  return repo.update(id, (state) => {
    const response = actStudio(
      state,
      actor,
      {
        type,
        expectedVersion: state.version,
        requestId: crypto.randomUUID(),
        ...extras,
      },
      new Date().toISOString(),
    )
    return { room: response.room, outcome: response }
  })
}
function blocked(fn: () => unknown, code: DomainError['code']) {
  assert.throws(
    fn,
    (error: unknown) => error instanceof DomainError && error.code === code,
  )
}
for (const id of scenarioIds()) {
  test(`${id}: eight JS cases, six configuration constraints, original code fails`, () => {
    const sc = SCENARIOS[id]
    assert.equal(sc.logic.cases.length, 8)
    assert.equal(sc.config.rules.length, 5)
    assert.equal(checkJavaScript(id, sc.logic.starter).passed, false)
    assert.equal(checkJavaScript(id, SOLVED[id]).passed, true)
    assert.equal(checkJavaScript(id, SOLVED[id]).results.length, 8)
    assert.equal(
      checkConfiguration(id, JSON.stringify(sc.config.starter)).passed,
      false,
    )
    assert.equal(checkConfiguration(id, solvedConfig(id)).passed, true)
    assert.equal(checkConfiguration(id, solvedConfig(id)).results.length, 6)
  })
  test(`${id}: solo recovery requires real code fixes, review, verification, and communication`, async () => {
    const { db, repo } = dbFixture()
    try {
      const { roomId, room } = await create(id)
      repo.create(room)
      const before = studioView(room, 'host-user')
      assert.equal(before.phase, 'lobby')
      assert.equal(before.mode, 'solo')
      assert.ok(before.js.source)
      blocked(
        () =>
          step(repo, roomId, 'host-user', 'test_js', { source: SOLVED[id] }),
        'INVALID_TRANSITION',
      )
      step(repo, roomId, 'host-user', 'start')
      blocked(
        () => step(repo, roomId, 'host-user', 'submit'),
        'INVALID_TRANSITION',
      )
      step(repo, roomId, 'host-user', 'inspect')
      assert.equal(
        studioEvidence(repo.read(roomId)!, 'host-user', 'logs').lines.length >=
          2,
        true,
      )
      step(repo, roomId, 'host-user', 'test_js', { source: scStarter(id) })
      assert.equal(repo.read(roomId)!.js.passed, false)
      step(repo, roomId, 'host-user', 'test_config', {
        source: JSON.stringify(SCENARIOS[id].config.starter),
      })
      assert.equal(repo.read(roomId)!.config.passed, false)
      blocked(
        () => step(repo, roomId, 'host-user', 'submit'),
        'INVALID_TRANSITION',
      )
      step(repo, roomId, 'host-user', 'test_js', { source: SOLVED[id] })
      step(repo, roomId, 'host-user', 'test_config', {
        source: solvedConfig(id),
      })
      step(repo, roomId, 'host-user', 'submit')
      const review = studioView(repo.read(roomId)!, 'host-user').reviewPacket
      assert.ok(review)
      assert.equal(review?.jsPassed, 8)
      assert.equal(review?.configPassed, 6)
      blocked(
        () => step(repo, roomId, 'host-user', 'approve'),
        'INVALID_TRANSITION',
      )
      blocked(
        () => step(repo, roomId, 'host-user', 'review', { notes: 'short' }),
        'INVALID_INPUT',
      )
      step(repo, roomId, 'host-user', 'review', {
        notes:
          'Both repair files pass all checks and address the incident root cause.',
      })
      step(repo, roomId, 'host-user', 'approve')
      blocked(
        () => step(repo, roomId, 'host-user', 'finish'),
        'INVALID_TRANSITION',
      )
      step(repo, roomId, 'host-user', 'apply')
      step(repo, roomId, 'host-user', 'verify')
      step(repo, roomId, 'host-user', 'communicate', {
        notes:
          'We are investigating affected requests and will share a verified update.',
      })
      step(repo, roomId, 'host-user', 'finish')
      const final = studioView(repo.read(roomId)!, 'host-user')
      assert.equal(final.phase, 'complete')
      assert.ok((final.score ?? 0) > 0)
      assert.match(final.debrief!.jsSource ?? '', /function/)
      assert.match(final.debrief!.configSource ?? '', /\{/)
      assert.equal(final.metrics.risk, 3)
      assert.equal(final.progress.verified, true)
      assert.doesNotMatch(
        JSON.stringify(final),
        /"invitationHash"|"ownerId"|"requests"/,
      )
    } finally {
      db.close()
    }
  })
}
function scStarter(id: ScenarioId) {
  return SCENARIOS[id].logic.starter
}

test('three independently authenticated roles with private evidence and reviewer-only source', async () => {
  const { db, repo } = dbFixture()
  try {
    const { roomId, room, codes } = await create('security', 'team')
    repo.create(room)
    blocked(
      () => step(repo, roomId, 'host-user', 'start'),
      'INVALID_TRANSITION',
    )
    const join = (who: string, role: 'engineer' | 'comms', digest: string) =>
      repo.update(roomId, (s) => ({
        room: claimStudioSeat(s, who, role, digest, Date.now()),
        outcome: true,
      }))
    blocked(() => join('attacker', 'engineer', '0'.repeat(64)), 'FORBIDDEN')
    const engineerHash = await hashInvitation(codes.engineer),
      commsHash = await hashInvitation(codes.comms)
    join('eng-user', 'engineer', engineerHash)
    assert.equal(
      repo.read(roomId)?.version,
      1,
      'joining advances the shared revision',
    )
    blocked(() => join('eng-user', 'comms', commsHash), 'FORBIDDEN')
    join('comms-user', 'comms', commsHash)
    assert.equal(
      repo.read(roomId)?.version,
      2,
      'each joined seat advances the shared revision',
    )
    blocked(() => join('attacker', 'engineer', engineerHash), 'CONFLICT')
    step(repo, roomId, 'host-user', 'start')
    blocked(() => step(repo, roomId, 'comms-user', 'inspect'), 'FORBIDDEN')
    blocked(
      () => studioEvidence(repo.read(roomId)!, 'comms-user', 'logs'),
      'FORBIDDEN',
    )
    assert.ok(
      studioEvidence(repo.read(roomId)!, 'eng-user', 'trace').lines.length,
    )
    assert.ok(
      studioEvidence(repo.read(roomId)!, 'comms-user', 'customers').lines
        .length,
    )
    step(repo, roomId, 'eng-user', 'inspect')
    const commanderBefore = studioView(repo.read(roomId)!, 'host-user')
    assert.equal(commanderBefore.js.source, undefined)
    assert.equal(commanderBefore.config.source, undefined)
    assert.equal(
      studioView(repo.read(roomId)!, 'comms-user').js.source,
      undefined,
    )
    assert.ok(studioView(repo.read(roomId)!, 'eng-user').js.source)
    blocked(
      () =>
        step(repo, roomId, 'comms-user', 'test_js', {
          source: SOLVED.security,
        }),
      'FORBIDDEN',
    )
    blocked(
      () =>
        step(repo, roomId, 'host-user', 'test_js', { source: SOLVED.security }),
      'FORBIDDEN',
    )
    step(repo, roomId, 'eng-user', 'test_js', { source: SOLVED.security })
    step(repo, roomId, 'eng-user', 'test_config', {
      source: solvedConfig('security'),
    })
    step(repo, roomId, 'eng-user', 'submit')
    assert.ok(studioView(repo.read(roomId)!, 'host-user').reviewPacket)
    assert.equal(
      studioView(repo.read(roomId)!, 'comms-user').reviewPacket,
      undefined,
    )
    blocked(
      () =>
        step(repo, roomId, 'comms-user', 'review', {
          notes: 'This patch is safe and fully verified.',
        }),
      'FORBIDDEN',
    )
    step(repo, roomId, 'host-user', 'review', {
      notes: 'This security patch revokes unsafe access and passes each test.',
    })
    step(repo, roomId, 'host-user', 'approve')
    blocked(() => step(repo, roomId, 'comms-user', 'apply'), 'FORBIDDEN')
    step(repo, roomId, 'eng-user', 'apply')
    step(repo, roomId, 'eng-user', 'verify')
    step(repo, roomId, 'comms-user', 'communicate', {
      notes:
        'We are investigating affected requests and will share a verified update.',
    })
    step(repo, roomId, 'host-user', 'finish')
    const commsFinal = studioView(repo.read(roomId)!, 'comms-user')
    assert.equal(commsFinal.phase, 'complete')
    assert.equal(commsFinal.js.source, undefined)
    assert.equal(commsFinal.config.source, undefined)
    assert.equal(commsFinal.debrief?.jsSource, undefined)
    assert.equal(commsFinal.debrief?.configSource, undefined)
    assert.equal(commsFinal.review, null)
    assert.equal(commsFinal.reviewPacket, undefined)
    assert.equal(commsFinal.js.results.length, 0)
    assert.equal(commsFinal.config.results.length, 0)
    assert.equal(
      studioView(repo.read(roomId)!, 'eng-user').js.source,
      SOLVED.security,
    )
    assert.equal(
      studioView(repo.read(roomId)!, 'comms-user').score,
      studioView(repo.read(roomId)!, 'eng-user').score,
    )
  } finally {
    db.close()
  }
})

test('idempotent commands cannot reuse request IDs with a new actor or changed code', async () => {
  const { db, repo } = dbFixture()
  try {
    const { roomId, room } = await create('checkout')
    repo.create(room)
    const input = {
      type: 'start' as const,
      expectedVersion: 0,
      requestId: 'same-request-key-001',
    }
    const once = repo.update(roomId, (r) => {
      const v = actStudio(r, 'host-user', input, new Date().toISOString())
      return { room: v.room, outcome: v }
    })
    assert.equal(once.replayed, false)
    const repeat = repo.update(roomId, (r) => {
      const v = actStudio(r, 'host-user', input, new Date().toISOString())
      return { room: v.room, outcome: v }
    })
    assert.equal(repeat.replayed, true)
    assert.equal(repo.read(roomId)?.version, 1)
    blocked(
      () =>
        repo.update(roomId, (r) => {
          const v = actStudio(
            r,
            'host-user',
            { ...input, type: 'inspect' },
            new Date().toISOString(),
          )
          return { room: v.room, outcome: v }
        }),
      'CONFLICT',
    )
    blocked(
      () =>
        repo.update(roomId, (r) => {
          const v = actStudio(
            r,
            'host-user',
            { ...input, expectedVersion: 1 },
            new Date().toISOString(),
          )
          return { room: v.room, outcome: v }
        }),
      'CONFLICT',
    )
    blocked(
      () =>
        repo.update(roomId, (r) => {
          const v = actStudio(r, 'other-user', input, new Date().toISOString())
          return { room: v.room, outcome: v }
        }),
      'FORBIDDEN',
    )
    blocked(
      () =>
        repo.update(roomId, (r) => {
          const v = actStudio(
            r,
            'host-user',
            { ...input, requestId: 'fresh-key-123' },
            new Date().toISOString(),
          )
          return { room: v.room, outcome: v }
        }),
      'CONFLICT',
    )
  } finally {
    db.close()
  }
})

test('bounded parser rejects loops, globals, prototype access, extra functions and syntax errors', () => {
  const prefix = 'function canAcceptPayment(order, previousIds)'
  const snippets = [
    `${prefix}{while(true){}}`,
    `${prefix}{return globalThis.process;}`,
    `${prefix}{return order.constructor;}`,
    `${prefix}{return previousIds.map(order.id);}`,
    `${prefix}{return true;} function dangerous(){return true;}`,
    `${prefix}{return true;`,
    `${prefix}{return eval("true");}`,
    `${prefix}{const p = order.__proto__; return true;}`,
    `${prefix}{return (order.amount > 0) ? true : false; window.alert(1);}`,
  ]
  for (const source of snippets)
    assert.equal(checkJavaScript('checkout', source).passed, false, source)
  assert.equal(
    checkConfiguration('checkout', '{"poolSize":"999"}').passed,
    false,
  )
  assert.equal(checkConfiguration('checkout', '{bad json}').passed, false)
})

test('branching outcomes affect score and impact, without skipping repair validation', async () => {
  const { roomId, room } = await create('ai-agent')
  let s = actStudio(
    room,
    'host-user',
    { type: 'start', requestId: 'req-start-111', expectedVersion: 0 },
    new Date().toISOString(),
  ).room
  const originalRisk = s.risk,
    originalAffected = s.affected
  s = actStudio(
    s,
    'host-user',
    { type: 'risky', requestId: 'req-risk-222', expectedVersion: s.version },
    new Date().toISOString(),
  ).room
  assert.ok(s.risk > originalRisk)
  assert.ok(s.affected > originalAffected)
  const afterRisk = s.risk
  s = actStudio(
    s,
    'host-user',
    {
      type: 'contain',
      requestId: 'req-contain-333',
      expectedVersion: s.version,
    },
    new Date().toISOString(),
  ).room
  assert.ok(s.risk < afterRisk)
  assert.equal(s.js.passed, false)
})

test('SQLite restart preserves room, submitted code and private review', async () => {
  const file = (await import('node:fs')).mkdtempSync(
    (await import('node:path')).join(
      (await import('node:os')).tmpdir(),
      'studio-',
    ),
  )
  const dbPath = (await import('node:path')).join(file, 'room.db')
  try {
    const open = () => {
      const db = new DatabaseSync(dbPath)
      const repo = new StudioRepository({
        sql: {
          exec(sql: string, ...args: (string | number | null)[]) {
            const st = db.prepare(sql)
            return /^\s*SELECT/i.test(sql)
              ? st.all(...args)
              : (st.run(...args), [])
          },
        },
        transactionSync<T>(f: () => T) {
          db.exec('BEGIN IMMEDIATE')
          try {
            const r = f()
            db.exec('COMMIT')
            return r
          } catch (e) {
            db.exec('ROLLBACK')
            throw e
          }
        },
      })
      return { db, repo }
    }
    const { roomId, room } = await create('ai-agent')
    let a = open()
    a.repo.create(room)
    step(a.repo, roomId, 'host-user', 'start')
    step(a.repo, roomId, 'host-user', 'inspect')
    step(a.repo, roomId, 'host-user', 'test_js', { source: SOLVED['ai-agent'] })
    a.db.close()
    a = open()
    assert.equal(a.repo.read(roomId)?.js.passed, true)
    assert.equal(a.repo.read(roomId)?.version, 3)
    a.db.close()
  } finally {
    ;(await import('node:fs')).rmSync(file, { recursive: true, force: true })
  }
})

test('server-owned chat authorship rejects strangers, replay collisions and oversize messages', async () => {
  const { postStudioMessage } = await import('./engine.ts')
  const { room } = await create('checkout')
  assert.throws(
    () =>
      postStudioMessage(
        room,
        'outsider',
        { id: 'chat-id-123', text: 'Spoofed message' },
        new Date().toISOString(),
      ),
    (e: unknown) => e instanceof DomainError && e.code === 'FORBIDDEN',
  )
  const first = postStudioMessage(
    room,
    'host-user',
    { id: 'chat-id-123', text: 'Checking the incident' },
    new Date().toISOString(),
  )
  assert.equal(first.replayed, false)
  assert.equal(first.room.messages[0].role, 'commander')
  assert.equal(first.room.messages[0].actorId, 'host-user')
  assert.equal(
    first.room.version,
    room.version + 1,
    'chat changes advance room revision',
  )
  const replay = postStudioMessage(
    first.room,
    'host-user',
    { id: 'chat-id-123', text: 'Checking the incident' },
    new Date().toISOString(),
  )
  assert.equal(replay.replayed, true)
  assert.equal(
    replay.room.version,
    first.room.version,
    'replayed chat cannot cause a second change',
  )
  blocked(
    () =>
      postStudioMessage(
        first.room,
        'host-user',
        { id: 'chat-id-123', text: 'Different message' },
        new Date().toISOString(),
      ),
    'CONFLICT',
  )
  blocked(
    () =>
      postStudioMessage(
        first.room,
        'host-user',
        { id: 'another-chat-id', text: 'x'.repeat(601) },
        new Date().toISOString(),
      ),
    'INVALID_INPUT',
  )
  assert.doesNotMatch(
    JSON.stringify(studioView(first.room, 'host-user')),
    /"actorId"/,
  )
})

test('team invites expire after 24 hours and cannot be used to enter a solo room', async () => {
  const t = await create('surge', 'team')
  const digest = await hashInvitation(t.codes.engineer)
  blocked(
    () =>
      claimStudioSeat(
        t.room,
        'late-joiner',
        'engineer',
        digest,
        Date.parse(t.room.inviteExpiresAt) + 1000,
      ),
    'FORBIDDEN',
  )
  const solo = await create('surge', 'solo')
  const soloHash = await hashInvitation(solo.codes.engineer)
  blocked(
    () =>
      claimStudioSeat(
        solo.room,
        'unwanted-user',
        'engineer',
        soloHash,
        Date.now(),
      ),
    'FORBIDDEN',
  )
})

test('competing decisions from the same revision accept exactly one write', async () => {
  const { db, repo } = dbFixture()
  try {
    const { roomId, room } = await create('checkout')
    repo.create(room)
    step(repo, roomId, 'host-user', 'start')
    const baseline = repo.read(roomId)!.version
    const competing = ['contain', 'risky'] as const
    const outcomes = await Promise.all(
      competing.map(async (type) => {
        try {
          repo.update(roomId, (r) => {
            const changed = actStudio(
              r,
              'host-user',
              {
                type,
                expectedVersion: baseline,
                requestId: crypto.randomUUID(),
              },
              new Date().toISOString(),
            )
            return { room: changed.room, outcome: changed }
          })
          return 'accepted'
        } catch (e) {
          assert.ok(e instanceof DomainError)
          return e.code
        }
      }),
    )
    assert.deepEqual(outcomes.sort(), ['CONFLICT', 'accepted'].sort())
    assert.equal(repo.read(roomId)?.version, baseline + 1)
    assert.equal(
      repo
        .read(roomId)
        ?.events.filter((e) => ['contain', 'risky'].includes(e.type)).length,
      1,
    )
  } finally {
    db.close()
  }
})

test('new chat invalidates stale decisions and remains replay-safe after reopening storage', async () => {
  const { db, repo } = dbFixture()
  try {
    const { roomId, room } = await create('notification')
    repo.create(room)
    step(repo, roomId, 'host-user', 'start')
    const previous = repo.read(roomId)!.version
    repo.update(roomId, (r) => {
      const value = postStudioMessage(
        r,
        'host-user',
        { id: 'chat-stale-check-001', text: 'Please verify the recovery plan' },
        new Date().toISOString(),
      )
      return { room: value.room, outcome: value }
    })
    blocked(
      () =>
        actStudio(
          repo.read(roomId)!,
          'host-user',
          {
            type: 'contain',
            expectedVersion: previous,
            requestId: 'request-stale-001',
          },
          new Date().toISOString(),
        ),
      'CONFLICT',
    )
    assert.equal(repo.read(roomId)?.messages.length, 1)
    assert.equal(repo.read(roomId)?.version, previous + 1)
    const replay = postStudioMessage(
      repo.read(roomId)!,
      'host-user',
      { id: 'chat-stale-check-001', text: 'Please verify the recovery plan' },
      new Date().toISOString(),
    )
    assert.equal(replay.replayed, true)
    assert.equal(replay.room.version, previous + 1)
  } finally {
    db.close()
  }
})

test('a retried message stays idempotent after it leaves the displayed history', async () => {
  let { room } = await create('checkout')
  for (let i = 0; i < 151; i++)
    room = postStudioMessage(
      room,
      'host-user',
      { id: 'message-' + i, text: 'Checked item ' + i },
      new Date().toISOString(),
    ).room
  assert.equal(room.messages.length, 150)
  assert.equal(
    postStudioMessage(
      room,
      'host-user',
      { id: 'message-0', text: 'Checked item 0' },
      new Date().toISOString(),
    ).replayed,
    true,
  )
})
