/**
 * Rehearsal platform-independent authoritative room coordinator.
 * Cloudflare DO and local Node tests use the same SQLite-style repository.
 * Caller identity MUST be derived from the authenticated server boundary.
 */
import { createIncident, applyCommand, viewFor, DomainError } from './domain/incident.ts';
import type { Incident, Role, CommandType, ParticipantView } from './domain/incident.ts';

export const ROLES = ['commander', 'engineer', 'comms'] as const;
export interface Seat { role: Role; userId: string | null; codeHash: string; }
export interface Message { id: string; actorId: string; role: Role; text: string; occurredAt: string; }
export interface RoomState {
  roomId: string;
  ownerId: string;
  createdAt: string;
  invitesExpireAt: string;
  seats: Seat[];
  incident: Incident | null;
  messages: Message[];
}
export type RoomView = {
  roomId: string;
  joined: number;
  people: { role: Role; filled: boolean }[];
  role: Role;
  incident: ParticipantView | null;
  messages: Message[];
};
export interface SqlLike { exec(sql: string, ...bindings: (string | number | null)[]): Iterable<Record<string, unknown>> }
export interface TransactionStorage { sql: SqlLike; transactionSync<T>(callback: () => T): T }

export function validateRoomId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9_-]{5,59}$/i.test(id)) {
    throw new DomainError('INVALID_INPUT', 'Room id must contain 6–60 safe characters');
  }
}
export function validateActor(id: unknown): asserts id is string {
  if (typeof id !== 'string' || id.length < 2 || id.length > 200) {
    throw new DomainError('INVALID_INPUT', 'Authenticated identity is invalid');
  }
}
export async function hashInvitation(code: string): Promise<string> {
  const bytes = new TextEncoder().encode(code);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
}
function matchHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export function buildRoom(id: string, ownerId: string, codeHashes: Record<Role, string>, now: string): RoomState {
  validateRoomId(id); validateActor(ownerId);
  if (!ROLES.every(role => /^[a-f0-9]{64}$/.test(codeHashes[role]))) {
    throw new DomainError('INVALID_INPUT', 'Missing secure invitations');
  }
  return {
    roomId: id, ownerId, createdAt: now, invitesExpireAt: new Date(Date.parse(now) + 24 * 60 * 60 * 1000).toISOString(), incident: null, messages: [],
    seats: ROLES.map(role => ({ role, userId: null, codeHash: codeHashes[role] })),
  };
}
/** The signed-in creator is always the commander; no separate commander code is needed. */
export function buildHostedRoom(id: string, creatorId: string, codeHashes: Record<Role, string>, now: string): RoomState {
  const room = buildRoom(id, creatorId, codeHashes, now);
  room.seats.find(s => s.role === 'commander')!.userId = creatorId;
  return room;
}
export function createCodes(): Record<Role, string> {
  return Object.fromEntries(ROLES.map(role => [role,
    Array.from(crypto.getRandomValues(new Uint8Array(24)), x => x.toString(16).padStart(2, '0')).join('')
  ])) as Record<Role, string>;
}
export function roleFor(room: RoomState, actorId: string): Role {
  const member = room.seats.find(s => s.userId === actorId);
  if (!member) throw new DomainError('FORBIDDEN', 'You are not a participant in this room');
  return member.role;
}
export function claimSeat(room: RoomState, userId: string, role: Role, codeHash: string, now = Date.now()): RoomState {
  validateActor(userId);
  if (!ROLES.includes(role)) throw new DomainError('INVALID_INPUT', 'Unknown role');
  const current = room.seats.find(s => s.userId === userId);
  if (current) {
    if (current.role !== role) throw new DomainError('FORBIDDEN', 'A user cannot occupy multiple seats');
    return room;
  }
  if (room.incident?.phase === 'complete') throw new DomainError('INVALID_TRANSITION', 'Exercise already completed');
  if (now > Date.parse(room.invitesExpireAt)) throw new DomainError('FORBIDDEN', 'Invitation has expired');
  const seat = room.seats.find(s => s.role === role)!;
  if (seat.userId) throw new DomainError('CONFLICT', 'That role has already been claimed');
  if (!matchHash(seat.codeHash, codeHash)) throw new DomainError('FORBIDDEN', 'Invalid invitation');
  const updated = structuredClone(room);
  updated.seats.find(s => s.role === role)!.userId = userId;
  if (updated.seats.every(s => s.userId)) {
    updated.incident = createIncident(updated.roomId, updated.seats.map(s => ({ userId: s.userId!, role: s.role })));
  }
  return updated;
}
export function commandRoom(room: RoomState, actorId: string, input: {
  type: CommandType; requestId: string; expectedVersion: number;
}, now: string): { room: RoomState; replayed: boolean } {
  roleFor(room, actorId);
  if (!room.incident) throw new DomainError('INVALID_TRANSITION', 'Waiting for all three participants');
  if (typeof input.requestId !== 'string' || input.requestId.length < 8 || input.requestId.length > 100 ||
    !Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new DomainError('INVALID_INPUT', 'Invalid request id or version');
  }
  const result = applyCommand(room.incident, {
    incidentId: room.roomId, actorId, type: input.type,
    requestId: input.requestId, expectedVersion: input.expectedVersion, occurredAt: now,
  });
  return { room: result.replayed ? room : { ...room, incident: result.state }, replayed: result.replayed };
}
export function messageRoom(room: RoomState, actorId: string, input: { id: string; text: string }, now: string): { room: RoomState; replayed: boolean } {
  const role = roleFor(room, actorId);
  if (typeof input.id !== 'string' || input.id.length < 8 || input.id.length > 100 ||
      typeof input.text !== 'string' || input.text.trim().length < 1 || input.text.length > 600) {
    throw new DomainError('INVALID_INPUT', 'Invalid message');
  }
  const existing = room.messages.find(m => m.id === input.id);
  if (existing) {
    if (existing.actorId !== actorId) throw new DomainError('INVALID_INPUT', 'Message id already belongs to another author');
    return { room, replayed: true };
  }
  const message: Message = { id: input.id, text: input.text.trim(), actorId, role, occurredAt: now };
  return { room: { ...room, messages: [...room.messages, message].slice(-150) }, replayed: false };
}
export function projectRoom(room: RoomState, actorId: string): RoomView {
  const role = roleFor(room, actorId);
  return {
    roomId: room.roomId,
    joined: room.seats.filter(x => x.userId).length,
    people: room.seats.map(x => ({ role: x.role, filled: Boolean(x.userId) })),
    role,
    incident: room.incident ? viewFor(room.incident, actorId) : null,
    messages: room.messages.map(m => ({ ...m })),
  };
}
/** Single-record SQLite transaction. The Durable Object owns all reads/writes. */
export class RoomRepository {
  private readonly storage: TransactionStorage;
  constructor(storage: TransactionStorage) {
    this.storage = storage;
    this.storage.sql.exec(`CREATE TABLE IF NOT EXISTS rehearsal_room (
      room_id TEXT PRIMARY KEY NOT NULL,
      state_json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0
    )`);
  }
  private readUnsafe(id: string): RoomState | null {
    const rows = Array.from(this.storage.sql.exec('SELECT state_json FROM rehearsal_room WHERE room_id = ?', id));
    return rows.length ? JSON.parse(String(rows[0].state_json)) as RoomState : null;
  }
  read(id: string): RoomState | null { validateRoomId(id); return this.readUnsafe(id); }
  create(room: RoomState): void {
    this.storage.transactionSync(() => {
      if (this.readUnsafe(room.roomId)) throw new DomainError('CONFLICT', 'Room already exists');
      this.storage.sql.exec('INSERT INTO rehearsal_room (room_id, state_json, revision) VALUES (?, ?, ?)',
        room.roomId, JSON.stringify(room), 0);
    });
  }
  update<T>(id: string, apply: (room: RoomState) => { room: RoomState; outcome: T }): T {
    validateRoomId(id);
    return this.storage.transactionSync(() => {
      const before = this.readUnsafe(id);
      if (!before) throw new DomainError('INVALID_INPUT', 'Room not found');
      const { room, outcome } = apply(before);
      if (room !== before) {
        this.storage.sql.exec('UPDATE rehearsal_room SET state_json = ?, revision = revision + 1 WHERE room_id = ?',
          JSON.stringify(room), id);
      }
      return outcome;
    });
  }
}
