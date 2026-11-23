/** Rehearsal's deterministic domain core. No SDK or AI dependencies. */
export type Role = 'commander' | 'engineer' | 'comms';
export type Phase = 'lobby' | 'active' | 'recovered' | 'complete';
export type CommandType =
  | 'start' | 'inspect_logs' | 'inspect_deploy' | 'request_rollback'
  | 'approve_rollback' | 'execute_rollback' | 'send_update'
  | 'advance_round' | 'finish';

export interface Participant { userId: string; role: Role; }
export interface Metrics { paymentFailurePercent: number; affectedCustomers: number; trustScore: number; }
export interface Event {
  id: string; version: number; actorId: string; type: CommandType;
  description: string; occurredAt: string;
}
export interface Incident {
  id: string;
  version: number;
  phase: Phase;
  round: number;
  participants: Participant[];
  metrics: Metrics;
  inspection: { logs: boolean; deploy: boolean };
  rollback: 'none' | 'requested' | 'approved' | 'executed';
  customerUpdateSent: boolean;
  events: Event[];
  /** Used by the authoritative DO for at-least-once request de-duplication. */
  processedRequests: Record<string, { version: number; actorId: string; type: CommandType }>;
  score: number | null;
}
export interface Command {
  incidentId: string;
  actorId: string; // MUST be supplied by verified server-side JWT, never browser input
  type: CommandType;
  requestId: string; // stable unique ID for retries
  expectedVersion: number;
  occurredAt: string; // provided by the trusted server clock
}
export type ErrorCode = 'INVALID_INPUT' | 'FORBIDDEN' | 'CONFLICT' | 'INVALID_TRANSITION';
export class DomainError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) { super(message); this.name = 'DomainError'; this.code = code; }
}

function requireRole(state: Incident, actorId: string, role: Role): void {
  if (!state.participants.some(p => p.userId === actorId && p.role === role)) {
    throw new DomainError('FORBIDDEN', `Only a ${role} can perform this action`);
  }
}
function requireActive(state: Incident): void {
  if (state.phase !== 'active') throw new DomainError('INVALID_TRANSITION', 'Incident must be active');
}
export function createIncident(id: string, participants: Participant[]): Incident {
  if (!id || participants.length !== 3 || new Set(participants.map(p => p.userId)).size !== 3 ||
      new Set(participants.map(p => p.role)).size !== 3 ||
      !(['commander', 'engineer', 'comms'] as const).every(role => participants.some(p => p.role === role))) {
    throw new DomainError('INVALID_INPUT', 'Require exactly one unique commander, engineer and comms participant');
  }
  return {
    id, version: 0, phase: 'lobby', round: 0,
    participants: structuredClone(participants),
    metrics: { paymentFailurePercent: 42, affectedCustomers: 142, trustScore: 55 },
    inspection: { logs: false, deploy: false },
    rollback: 'none', customerUpdateSent: false, events: [], processedRequests: {}, score: null,
  };
}
export function applyCommand(previous: Incident, command: Command): { state: Incident; replayed: boolean } {
  if (!command.requestId || !command.occurredAt || command.incidentId !== previous.id) {
    throw new DomainError('INVALID_INPUT', 'Malformed command or incident ID');
  }
  const priorRequest = previous.processedRequests[command.requestId];
  if (priorRequest) {
    if (priorRequest.actorId !== command.actorId || priorRequest.type !== command.type) {
      throw new DomainError('INVALID_INPUT', 'Request ID was already used for a different command');
    }
    return { state: previous, replayed: true };
  }
  if (command.expectedVersion !== previous.version) {
    throw new DomainError('CONFLICT', `Stale state: expected version ${previous.version}`);
  }
  if (!previous.participants.some(p => p.userId === command.actorId)) {
    throw new DomainError('FORBIDDEN', 'User is not a member of this incident');
  }
  const state = structuredClone(previous);
  let description = '';
  switch (command.type) {
    case 'start':
      requireRole(state, command.actorId, 'commander');
      if (state.phase !== 'lobby') throw new DomainError('INVALID_TRANSITION', 'Already started');
      state.phase = 'active'; state.round = 1;
      description = 'Incident simulation started';
      break;
    case 'inspect_logs':
      requireRole(state, command.actorId, 'engineer'); requireActive(state);
      if (state.inspection.logs) throw new DomainError('INVALID_TRANSITION', 'Logs already inspected');
      state.inspection.logs = true;
      description = 'Engineer reviewed diagnostic logs'; // never publish secret role-specific evidence
      break;
    case 'inspect_deploy':
      requireRole(state, command.actorId, 'engineer'); requireActive(state);
      if (state.inspection.deploy) throw new DomainError('INVALID_TRANSITION', 'Deployment already inspected');
      state.inspection.deploy = true;
      description = 'Engineer reviewed deployment history';
      break;
    case 'request_rollback':
      requireRole(state, command.actorId, 'engineer'); requireActive(state);
      if (!state.inspection.logs || !state.inspection.deploy || state.rollback !== 'none') {
        throw new DomainError('INVALID_TRANSITION', 'Collect evidence before requesting a rollback');
      }
      state.rollback = 'requested'; description = 'Engineer requested rollback approval';
      break;
    case 'approve_rollback':
      requireRole(state, command.actorId, 'commander'); requireActive(state);
      if (state.rollback !== 'requested') throw new DomainError('INVALID_TRANSITION', 'No rollback awaiting approval');
      state.rollback = 'approved'; description = 'Commander approved rollback';
      break;
    case 'execute_rollback':
      requireRole(state, command.actorId, 'engineer'); requireActive(state);
      if (state.rollback !== 'approved') throw new DomainError('INVALID_TRANSITION', 'Rollback has not been approved');
      state.rollback = 'executed'; state.phase = 'recovered';
      state.metrics.paymentFailurePercent = 3;
      description = 'Simulated rollback completed; checkout failure rate now 3%';
      break;
    case 'send_update':
      requireRole(state, command.actorId, 'comms');
      if (!['active', 'recovered'].includes(state.phase) || state.customerUpdateSent) {
        throw new DomainError('INVALID_TRANSITION', 'Update already sent or incident not active');
      }
      state.customerUpdateSent = true;
      state.metrics.trustScore = Math.min(100, state.metrics.trustScore + 15);
      description = 'Communications lead published simulated customer update';
      break;
    case 'advance_round':
      requireRole(state, command.actorId, 'commander'); requireActive(state);
      if (state.round >= 4) throw new DomainError('INVALID_TRANSITION', 'Maximum four rounds');
      state.round += 1;
      state.metrics.paymentFailurePercent = Math.min(95, state.metrics.paymentFailurePercent + 9);
      state.metrics.affectedCustomers += 80;
      state.metrics.trustScore = Math.max(0, state.metrics.trustScore - 7);
      description = `Incident escalated to round ${state.round}`;
      break;
    case 'finish':
      requireRole(state, command.actorId, 'commander');
      if (state.phase !== 'recovered' || !state.customerUpdateSent) {
        throw new DomainError('INVALID_TRANSITION', 'Recovery and customer communication are required');
      }
      state.phase = 'complete';
      state.score = Math.max(0, Math.min(100, 100 - (state.round - 1) * 12 -
        Math.floor((state.metrics.affectedCustomers - 142) / 20) +
        Math.floor((state.metrics.trustScore - 55) / 5)));
      description = `Simulation complete; score ${state.score}/100`;
      break;
    default: {
      const exhaustive: never = command.type;
      throw new DomainError('INVALID_INPUT', `Unknown action ${exhaustive}`);
    }
  }
  state.version += 1;
  state.events.push({ id: `${state.id}:${state.version}`, version: state.version,
    actorId: command.actorId, type: command.type, description, occurredAt: command.occurredAt });
  state.processedRequests[command.requestId] = { version: state.version, actorId: command.actorId, type: command.type };
  return { state, replayed: false };
}

export interface ParticipantView {
  incidentId: string; version: number; phase: Phase; round: number; role: Role;
  metrics: Metrics; events: Event[]; rollback: Incident['rollback'];
  customerUpdateSent: boolean; score: number | null;
  privateBriefing: string[];
}
/** Only this projection should cross into player-facing APIs or AI prompts. */
export function viewFor(state: Incident, userId: string): ParticipantView {
  const participant = state.participants.find(p => p.userId === userId);
  if (!participant) throw new DomainError('FORBIDDEN', 'No access to this incident');
  const privateBriefing: string[] = [];
  if (participant.role === 'engineer') {
    privateBriefing.push('Engineering: checkout errors began immediately after release 1.4.');
    if (state.inspection.logs) privateBriefing.push('Log clue: payment provider calls are failing after a new retry change.');
    if (state.inspection.deploy) privateBriefing.push('Deployment clue: release 1.4 changed the checkout retry handler.');
  } else if (participant.role === 'commander') {
    privateBriefing.push('Command: authorize or reject major mitigation actions; prioritize customer safety.');
  } else {
    privateBriefing.push('Communications: customer complaints are rising; publish a factual update.');
  }
  return {
    incidentId: state.id, version: state.version, phase: state.phase, round: state.round,
    role: participant.role, metrics: structuredClone(state.metrics),
    events: structuredClone(state.events), rollback: state.rollback,
    customerUpdateSent: state.customerUpdateSent, score: state.score, privateBriefing,
  };
}
