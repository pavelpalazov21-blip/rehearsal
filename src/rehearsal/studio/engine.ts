/** Authoritative Rehearsal Stage 9 state machine — independent of any web framework. */
import { DomainError } from '../room-state.ts'
import { validateActor, validateRoomId, hashInvitation } from '../room-state.ts'
import type { TransactionStorage } from '../room-state.ts'
import { getScenario, scenarioSummary } from './scenarios.ts'
import type { ScenarioId } from './scenarios.ts'
import { checkJavaScript, checkConfiguration } from './repair.ts'
import type { TestResult } from './repair.ts'

export type StudioRole = 'commander' | 'engineer' | 'comms'
export type StudioMode = 'solo' | 'team'
export type StudioPhase = 'lobby' | 'active' | 'complete'
export type StudioCommand =
  | 'start'
  | 'inspect'
  | 'contain'
  | 'risky'
  | 'test_js'
  | 'test_config'
  | 'submit'
  | 'review'
  | 'approve'
  | 'apply'
  | 'verify'
  | 'communicate'
  | 'finish'
export interface Seat {
  role: StudioRole
  userId: string | null
  virtual: boolean
  invitationHash: string | null
}
export interface Lab {
  source: string
  revision: number
  passed: boolean
  results: TestResult[]
  status:
    'draft' | 'needs-work' | 'tested' | 'submitted' | 'approved' | 'applied'
}
export interface StudioEvent {
  version: number
  type: string
  by: StudioRole | 'director'
  at: string
  text: string
}
export interface StudioMessage {
  id: string
  role: StudioRole
  actorId: string
  text: string
  at: string
}
export interface StudioState {
  roomId: string
  ownerId: string
  scenarioId: ScenarioId
  mode: StudioMode
  phase: StudioPhase
  version: number
  createdAt: string
  inviteExpiresAt: string
  seats: Seat[]
  risk: number
  affected: number
  trust: number
  elapsedMinutes: number
  inspected: boolean
  contained: boolean
  riskyAttempted: boolean
  updatedCustomers: boolean
  recovery: 'none' | 'submitted' | 'approved' | 'applied'
  verified: boolean
  score: number | null
  js: Lab
  config: Lab
  review: null | {
    notes: string
    by: StudioRole
    at: string
    jsRevision: number
    configRevision: number
  }
  messages: StudioMessage[]
  events: StudioEvent[]
  messageReceipts?: Record<string, { actorId: string; text: string }>
  requests: Record<
    string,
    { actor: string; fingerprint: string; version: number }
  >
}
export interface StudioActionInput {
  type: StudioCommand
  requestId: string
  expectedVersion: number
  source?: string
  notes?: string
}
export interface StudioView {
  roomId: string
  role: StudioRole
  scenario: ReturnType<typeof scenarioSummary>[number]
  mode: StudioMode
  phase: StudioPhase
  version: number
  joined: number
  seats: { role: StudioRole; filled: boolean; virtual: boolean }[]
  metrics: {
    risk: number
    affected: number
    trust: number
    elapsedMinutes: number
  }
  progress: {
    inspected: boolean
    contained: boolean
    riskyAttempted: boolean
    updatedCustomers: boolean
    recovery: StudioState['recovery']
    verified: boolean
  }
  score: number | null
  events: StudioEvent[]
  messages: Omit<StudioMessage, 'actorId'>[]
  js: {
    filename: string
    status: Lab['status']
    revision: number
    passed: boolean
    results: TestResult[]
    source?: string
    task?: string
  }
  config: {
    filename: string
    status: Lab['status']
    revision: number
    passed: boolean
    results: TestResult[]
    source?: string
  }
  review: StudioState['review']
  reviewed: boolean
  reviewPacket?: {
    jsBefore: string
    jsAfter: string
    configBefore: string
    configAfter: string
    jsPassed: number
    configPassed: number
  }
  debrief?: {
    recovery: string
    lesson: string
    verification: string
    risks: number
    score: number
    events: number
    jsSource?: string
    configSource?: string
  }
}
const ROLES: StudioRole[] = ['commander', 'engineer', 'comms']
function fail(
  message: string,
  code:
    | 'INVALID_INPUT'
    | 'FORBIDDEN'
    | 'CONFLICT'
    | 'INVALID_TRANSITION' = 'INVALID_TRANSITION',
): never {
  throw new DomainError(code, message)
}
function member(room: StudioState, actor: string): StudioRole {
  validateActor(actor)
  const match = room.seats.find((s) => s.userId === actor)
  if (!match)
    fail('Only authenticated room members can perform this action', 'FORBIDDEN')
  return match!.role
}
function can(room: StudioState, actorRole: StudioRole, target: StudioRole) {
  return (
    actorRole === target ||
    (room.mode === 'solo' &&
      actorRole === 'commander' &&
      target !== 'commander')
  )
}
function event(
  room: StudioState,
  type: string,
  by: StudioEvent['by'],
  text: string,
  at: string,
) {
  room.events.push({ type, by, text, at, version: room.version })
  if (room.events.length > 200) room.events.shift()
}
function announce(room: StudioState, by: StudioRole, text: string, at: string) {
  room.messages.push({
    id: `${room.roomId}:v${room.version}`,
    role: by,
    actorId: 'virtual',
    text,
    at,
  })
  if (room.messages.length > 150) room.messages.shift()
}
function lab(source: string): Lab {
  return { source, revision: 0, passed: false, results: [], status: 'draft' }
}
export function newStudioRoom(
  roomId: string,
  ownerId: string,
  scenarioId: ScenarioId,
  mode: StudioMode,
  hashes: Record<'engineer' | 'comms', string>,
  now: string,
): StudioState {
  validateRoomId(roomId)
  validateActor(ownerId)
  if (!['solo', 'team'].includes(mode))
    fail('Mode must be solo or team', 'INVALID_INPUT')
  const scenario = getScenario(scenarioId)
  if (!Number.isFinite(Date.parse(now)))
    fail('Invalid creation time', 'INVALID_INPUT')
  if (
    !/^[0-9a-f]{64}$/.test(hashes.engineer) ||
    !/^[0-9a-f]{64}$/.test(hashes.comms)
  )
    fail('Invitations must be securely hashed', 'INVALID_INPUT')
  return {
    roomId,
    ownerId,
    scenarioId,
    mode,
    phase: 'lobby',
    version: 0,
    createdAt: now,
    inviteExpiresAt: new Date(Date.parse(now) + 86_400_000).toISOString(),
    seats: [
      {
        role: 'commander',
        userId: ownerId,
        virtual: false,
        invitationHash: null,
      },
      {
        role: 'engineer',
        userId: null,
        virtual: mode === 'solo',
        invitationHash: hashes.engineer,
      },
      {
        role: 'comms',
        userId: null,
        virtual: mode === 'solo',
        invitationHash: hashes.comms,
      },
    ],
    risk: scenario.initial.risk,
    affected: scenario.initial.affected,
    trust: scenario.initial.trust,
    elapsedMinutes: 0,
    inspected: false,
    contained: false,
    riskyAttempted: false,
    updatedCustomers: false,
    recovery: 'none',
    verified: false,
    score: null,
    js: lab(scenario.logic.starter),
    config: lab(JSON.stringify(scenario.config.starter, null, 2)),
    review: null,
    messages: [],
    events: [],
    requests: {},
  }
}
/** Invite codes are 192-bit random tokens, never persisted in cleartext. */
export function createStudioInvites(): Record<'engineer' | 'comms', string> {
  return { engineer: hexCode(), comms: hexCode() }
}
function hexCode() {
  return [...crypto.getRandomValues(new Uint8Array(24))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
export async function createNewStudioRoom(
  id: string,
  owner: string,
  scenario: ScenarioId,
  mode: StudioMode,
  now: string,
) {
  const codes = createStudioInvites()
  const hashes = {
    engineer: await hashInvitation(codes.engineer),
    comms: await hashInvitation(codes.comms),
  }
  return { room: newStudioRoom(id, owner, scenario, mode, hashes, now), codes }
}
export function claimStudioSeat(
  room: StudioState,
  actor: string,
  role: StudioRole,
  hash: string,
  now: number,
): StudioState {
  validateActor(actor)
  if (room.mode !== 'team')
    fail('Solo room has no human invitation seats', 'FORBIDDEN')
  if (role === 'commander' || !ROLES.includes(role))
    fail('This role cannot be invited', 'INVALID_INPUT')
  const existing = room.seats.find((s) => s.userId === actor)
  if (existing) {
    if (existing.role !== role)
      fail('One account may hold one seat', 'FORBIDDEN')
    return room
  }
  if (room.phase !== 'lobby') fail('Cannot join an incident already started')
  if (now > Date.parse(room.inviteExpiresAt))
    fail('Invitation expired', 'FORBIDDEN')
  const seat = room.seats.find((s) => s.role === role)!
  if (seat.userId) fail('This seat is occupied', 'CONFLICT')
  if (!/^[a-f0-9]{64}$/.test(hash) || seat.invitationHash !== hash)
    fail('Invalid invitation', 'FORBIDDEN')
  const next = structuredClone(room)
  next.seats.find((s) => s.role === role)!.userId = actor
  next.version++ // Joining is a shared-state change; stale commands must not commit against the old team.
  return next
}
function inputHash(input: StudioActionInput): string {
  return JSON.stringify([
    input.type,
    input.expectedVersion,
    input.source ?? null,
    input.notes ?? null,
  ])
}
function validateCommand(input: StudioActionInput) {
  if (
    !input ||
    typeof input.requestId !== 'string' ||
    input.requestId.length < 8 ||
    input.requestId.length > 100 ||
    !Number.isInteger(input.expectedVersion) ||
    input.expectedVersion < 0
  )
    fail('Malformed command', 'INVALID_INPUT')
}
export function actStudio(
  previous: StudioState,
  actor: string,
  input: StudioActionInput,
  now: string,
): { room: StudioState; replayed: boolean } {
  const role = member(previous, actor)
  validateCommand(input)
  const fingerprint = inputHash(input),
    cached = Object.hasOwn(previous.requests, input.requestId)
      ? previous.requests[input.requestId]
      : undefined
  if (cached) {
    if (cached.actor !== actor || cached.fingerprint !== fingerprint)
      fail('Idempotency key reused with different payload', 'CONFLICT')
    return { room: previous, replayed: true }
  }
  if (input.expectedVersion !== previous.version)
    fail(`Version conflict: current ${previous.version}`, 'CONFLICT')
  if (!Number.isFinite(Date.parse(now)))
    fail('Invalid server timestamp', 'INVALID_INPUT')
  const s = structuredClone(previous),
    sc = getScenario(s.scenarioId)
  const needActive = () => {
    if (s.phase !== 'active') fail('Start the incident first')
  }
  const requires = (r: StudioRole) => {
    if (!can(s, role, r)) fail(`Only ${r} can perform this action`, 'FORBIDDEN')
  }
  s.version++
  let text = ''
  switch (input.type) {
    case 'start':
      requires('commander')
      if (s.phase !== 'lobby') fail('Incident already started')
      if (s.mode === 'team' && !s.seats.every((seat) => Boolean(seat.userId)))
        fail('All three team members must join')
      s.phase = 'active'
      text = `Incident declared: ${sc.title}`
      break
    case 'inspect':
      requires('engineer')
      needActive()
      if (s.inspected) fail('Evidence already inspected')
      s.js.results = checkJavaScript(s.scenarioId, s.js.source).results
      s.config.results = checkConfiguration(
        s.scenarioId,
        s.config.source,
      ).results
      s.inspected = true
      s.affected += Math.ceil(s.affected * 0.03)
      s.trust = Math.max(0, s.trust - 2)
      s.elapsedMinutes += 2
      text = 'Engineering investigated logs, traces, and deployment evidence'
      if (s.mode === 'solo')
        announce(
          s,
          'engineer',
          'Diagnosis complete. Edit and test both files before submitting.',
          now,
        )
      break
    case 'contain':
      requires('commander')
      needActive()
      if (s.contained || s.recovery === 'applied')
        fail('Containment unavailable')
      s.contained = true
      s.risk = Math.max(9, s.risk - 10)
      s.trust = Math.min(100, s.trust + 2)
      s.elapsedMinutes++
      text = sc.containment
      break
    case 'risky':
      requires('commander')
      needActive()
      if (s.riskyAttempted || s.recovery !== 'none')
        fail('Emergency option unavailable')
      s.riskyAttempted = true
      s.risk = Math.min(95, s.risk + 17)
      s.affected += Math.max(30, Math.ceil(s.affected * 0.15))
      s.trust = Math.max(0, s.trust - 11)
      s.elapsedMinutes += 3
      text = sc.riskyChoice
      break
    case 'test_js':
    case 'test_config': {
      requires('engineer')
      needActive()
      if (!s.inspected) fail('Inspect evidence first')
      if (s.recovery !== 'none') fail('Patch already submitted')
      const current = input.type === 'test_js' ? s.js : s.config
      if (typeof input.source !== 'string')
        fail('Editor source is required', 'INVALID_INPUT')
      const check =
        input.type === 'test_js'
          ? checkJavaScript(s.scenarioId, input.source)
          : checkConfiguration(s.scenarioId, input.source)
      current.source = input.source.slice(
        0,
        input.type === 'test_js' ? 3500 : 4500,
      )
      current.revision++
      current.results = check.results
      current.passed = check.passed
      current.status = check.passed ? 'tested' : 'needs-work'
      s.elapsedMinutes++
      text = `${input.type === 'test_js' ? 'JavaScript' : 'Configuration'}: ${check.results.filter((r) => r.passed).length}/${check.results.length} checks passed`
      break
    }
    case 'submit':
      requires('engineer')
      needActive()
      if (!s.inspected || s.recovery !== 'none') fail('Submission unavailable')
      if (
        !s.js.passed ||
        !s.config.passed ||
        s.js.status !== 'tested' ||
        s.config.status !== 'tested'
      )
        fail('Both files must pass all checks before submitting')
      s.recovery = 'submitted'
      s.js.status = 'submitted'
      s.config.status = 'submitted'
      s.elapsedMinutes++
      text = 'Engineer submitted two verified repair artifacts'
      break
    case 'review':
      requires('commander')
      needActive()
      if (s.recovery !== 'submitted') fail('No submitted patch')
      if (s.review) fail('Review already recorded', 'CONFLICT')
      if (
        typeof input.notes !== 'string' ||
        input.notes.trim().length < 20 ||
        input.notes.length > 500
      )
        fail('Write a specific review of 20–500 characters', 'INVALID_INPUT')
      s.review = {
        notes: input.notes.trim(),
        by: 'commander',
        at: now,
        jsRevision: s.js.revision,
        configRevision: s.config.revision,
      }
      s.elapsedMinutes++
      text =
        'Commander reviewed both repair files and documented the safety rationale'
      break
    case 'approve':
      requires('commander')
      needActive()
      if (
        s.recovery !== 'submitted' ||
        !s.review ||
        s.review.jsRevision !== s.js.revision ||
        s.review.configRevision !== s.config.revision
      )
        fail('Inspect the submitted patch and record a review before approval')
      s.recovery = 'approved'
      s.js.status = 'approved'
      s.config.status = 'approved'
      s.elapsedMinutes++
      text = 'Commander authorized the reviewed technical repair'
      break
    case 'apply':
      requires('engineer')
      needActive()
      if (s.recovery !== 'approved' || !s.js.passed || !s.config.passed)
        fail('An approved, passing patch is required')
      s.recovery = 'applied'
      s.js.status = 'applied'
      s.config.status = 'applied'
      s.risk = 3
      s.trust = Math.min(100, s.trust + 6)
      s.elapsedMinutes += 2
      text = sc.recovery
      if (s.mode === 'solo')
        announce(
          s,
          'engineer',
          `Applied the approved repair. ${sc.verification}`,
          now,
        )
      break
    case 'verify':
      requires('engineer')
      needActive()
      if (s.recovery !== 'applied' || s.verified)
        fail('Apply the patch before verification')
      if (
        !checkJavaScript(s.scenarioId, s.js.source).passed ||
        !checkConfiguration(s.scenarioId, s.config.source).passed
      )
        fail('The applied repair failed the recovery checks')
      s.verified = true
      s.elapsedMinutes++
      text = sc.verification
      break
    case 'communicate':
      requires('comms')
      needActive()
      if (s.updatedCustomers) fail('Customer update already published')
      if (
        typeof input.notes !== 'string' ||
        input.notes.trim().length < 20 ||
        input.notes.trim().length > 500
      )
        fail('Write a customer update of 20–500 characters', 'INVALID_INPUT')
      s.updatedCustomers = true
      s.trust = Math.min(100, s.trust + 8)
      s.elapsedMinutes++
      text = 'Customer-facing status update published'
      announce(s, 'comms', input.notes.trim(), now)
      break
    case 'finish':
      requires('commander')
      needActive()
      if (!s.verified || !s.updatedCustomers)
        fail('Validate recovery and update customers first')
      s.phase = 'complete'
      s.score = Math.max(
        0,
        Math.min(
          100,
          93 -
            (s.riskyAttempted ? 20 : 0) +
            (s.contained ? 4 : 0) +
            (s.trust >= 70 ? 2 : 0) -
            (s.elapsedMinutes > 20 ? 8 : 0),
        ),
      )
      text = `Exercise complete: ${s.score}/100`
      break
    default:
      fail('Unsupported command', 'INVALID_INPUT')
  }
  event(s, input.type, role, text, now)
  Object.defineProperty(s.requests, input.requestId, {
    value: { actor, fingerprint, version: s.version },
    enumerable: true,
    writable: true,
    configurable: true,
  })
  return { room: s, replayed: false }
}
/** Chat commands are never permitted to specify their authenticated author. */
export function postStudioMessage(
  previous: StudioState,
  actor: string,
  input: { id: string; text: string },
  now: string,
): { room: StudioState; replayed: boolean } {
  const role = member(previous, actor)
  if (
    typeof input.id !== 'string' ||
    input.id.length < 8 ||
    input.id.length > 100 ||
    typeof input.text !== 'string' ||
    input.text.trim().length === 0 ||
    input.text.length > 600
  )
    fail('Invalid chat message', 'INVALID_INPUT')
  const receipts = previous.messageReceipts ?? {}
  const exists = Object.hasOwn(receipts, input.id)
    ? receipts[input.id]
    : previous.messages.find((m) => m.id === input.id)
  if (exists) {
    if (exists.actorId !== actor || exists.text !== input.text.trim())
      fail('Message ID already used by a different message', 'CONFLICT')
    return { room: previous, replayed: true }
  }
  const room = structuredClone(previous)
  room.messageReceipts ??= Object.fromEntries(
    previous.messages.map((m) => [m.id, { actorId: m.actorId, text: m.text }]),
  )
  Object.defineProperty(room.messageReceipts, input.id, {
    value: { actorId: actor, text: input.text.trim() },
    enumerable: true,
    writable: true,
    configurable: true,
  })
  room.version++ // Messages have unique revisions too, so reconnect and sync can detect new chat.
  room.messages.push({
    id: input.id,
    role,
    actorId: actor,
    text: input.text.trim(),
    at: now,
  })
  if (room.messages.length > 150) room.messages.shift()
  return { room, replayed: false }
}
/** The only projection allowed to leave the authoritative server. */
export function studioView(state: StudioState, actor: string): StudioView {
  const role = member(state, actor),
    sc = getScenario(state.scenarioId)
  const editor =
    role === 'engineer' || (state.mode === 'solo' && role === 'commander')
  const reviewer =
    role === 'commander' &&
    ['submitted', 'approved', 'applied'].includes(state.recovery)
  const finished = state.phase === 'complete'
  // Completion reveals the score, not another person's private source or evidence.
  const full = editor || reviewer
  const scenario = scenarioSummary().find((x) => x.id === state.scenarioId)!
  const view: StudioView = {
    roomId: state.roomId,
    role,
    scenario,
    mode: state.mode,
    phase: state.phase,
    version: state.version,
    joined: state.seats.filter((x) => x.userId).length,
    seats: state.seats.map((s) => ({
      role: s.role,
      filled: !!s.userId || s.virtual,
      virtual: s.virtual,
    })),
    metrics: {
      risk: state.risk,
      affected: state.affected,
      trust: state.trust,
      elapsedMinutes: state.elapsedMinutes,
    },
    progress: {
      inspected: state.inspected,
      contained: state.contained,
      riskyAttempted: state.riskyAttempted,
      updatedCustomers: state.updatedCustomers,
      recovery: state.recovery,
      verified: state.verified,
    },
    score: state.score,
    events: structuredClone(state.events),
    messages: state.messages.map(({ id, role, text, at }) => ({
      id,
      role,
      text,
      at,
    })),
    js: {
      filename: sc.logic.filename,
      status: state.js.status,
      revision: state.js.revision,
      passed: state.js.passed,
      results: full ? structuredClone(state.js.results) : [],
      ...(full ? { source: state.js.source } : {}),
      ...(editor ? { task: sc.logic.task } : {}),
    },
    config: {
      filename: sc.config.filename,
      status: state.config.status,
      revision: state.config.revision,
      passed: state.config.passed,
      results: full ? structuredClone(state.config.results) : [],
      ...(full ? { source: state.config.source } : {}),
    },
    review: reviewer ? structuredClone(state.review) : null,
    reviewed: !!state.review,
  }
  if (reviewer)
    view.reviewPacket = {
      jsBefore: sc.logic.starter,
      jsAfter: state.js.source,
      configBefore: JSON.stringify(sc.config.starter, null, 2),
      configAfter: state.config.source,
      jsPassed: state.js.results.filter((r) => r.passed).length,
      configPassed: state.config.results.filter((r) => r.passed).length,
    }
  if (finished)
    view.debrief = {
      recovery: sc.recovery,
      lesson: sc.lesson,
      verification: sc.verification,
      risks: state.riskyAttempted ? 1 : 0,
      score: state.score ?? 0,
      events: state.events.length,
      ...(full
        ? { jsSource: state.js.source, configSource: state.config.source }
        : {}),
    }
  return view
}
export function studioEvidence(
  state: StudioState,
  actor: string,
  command: string,
): { command: string; lines: string[]; simulated: true } {
  const role = member(state, actor),
    sc = getScenario(state.scenarioId)
  if (state.phase === 'lobby')
    return {
      command,
      lines: ['Start the incident to reveal evidence.'],
      simulated: true,
    }
  const help = [
    'help',
    'status',
    'logs',
    'trace',
    'deploys',
    'customers',
    'runbook',
  ]
  if (!help.includes(command))
    return {
      command,
      lines: ['Unknown command. Use help for a list of commands.'],
      simulated: true,
    }
  if (
    ['logs', 'trace', 'deploys'].includes(command) &&
    !can(state, role, 'engineer')
  )
    fail('Engineering evidence is private', 'FORBIDDEN')
  if (command === 'help')
    return {
      command,
      lines: [
        'Commands: help, status, logs, trace, deploys, customers, runbook',
        'Logs/traces/deployments require the engineer seat.',
      ],
      simulated: true,
    }
  if (command === 'status')
    return {
      command,
      lines: [
        `Incident: ${sc.title}`,
        `Risk ${state.risk}% | Affected ${state.affected} | Trust ${state.trust}/100`,
        `Recovery: ${state.recovery} | Inspection: ${state.inspected ? 'completed' : 'pending'}`,
      ],
      simulated: true,
    }
  if (command === 'runbook')
    return {
      command,
      lines: [
        'Assess impact and preserve evidence.',
        'Investigate logs, traces, and recent deployments.',
        'Repair JavaScript and configuration; run both test suites.',
        'Submit, review and approve the patch.',
        'Apply, verify recovery and update customers.',
      ],
      simulated: true,
    }
  return {
    command,
    lines: sc.evidence[command as keyof typeof sc.evidence].slice(),
    simulated: true,
  }
}
export class StudioRepository {
  private readonly storage: TransactionStorage
  constructor(storage: TransactionStorage) {
    this.storage = storage
    this.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS studio_room (room_id TEXT PRIMARY KEY NOT NULL,state_json TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0)',
    )
  }
  private readUnsafe(id: string): StudioState | null {
    const r = [
      ...this.storage.sql.exec(
        'SELECT state_json FROM studio_room WHERE room_id = ?',
        id,
      ),
    ]
    return r.length
      ? (JSON.parse(String(r[0].state_json)) as StudioState)
      : null
  }
  read(id: string) {
    validateRoomId(id)
    return this.readUnsafe(id)
  }
  create(room: StudioState) {
    this.storage.transactionSync(() => {
      if (this.readUnsafe(room.roomId)) fail('Room already exists', 'CONFLICT')
      this.storage.sql.exec(
        'INSERT INTO studio_room (room_id,state_json,revision) VALUES (?,?,?)',
        room.roomId,
        JSON.stringify(room),
        0,
      )
    })
  }
  update<T>(
    id: string,
    fn: (r: StudioState) => { room: StudioState; outcome: T },
  ): T {
    validateRoomId(id)
    return this.storage.transactionSync(() => {
      const old = this.readUnsafe(id)
      if (!old) fail('Room not found', 'INVALID_INPUT')
      const { room, outcome } = fn(old!)
      if (room !== old)
        this.storage.sql.exec(
          'UPDATE studio_room SET state_json = ?,revision = revision + 1 WHERE room_id = ?',
          JSON.stringify(room),
          id,
        )
      return outcome
    })
  }
}
