export type ErrorCode =
  'INVALID_INPUT' | 'FORBIDDEN' | 'CONFLICT' | 'INVALID_TRANSITION'
export class DomainError extends Error {
  readonly code: ErrorCode
  constructor(code: ErrorCode, message: string) {
    super(message)
    this.name = 'DomainError'
    this.code = code
  }
}

export interface SqlLike {
  exec(
    sql: string,
    ...bindings: (string | number | null)[]
  ): Iterable<Record<string, unknown>>
}
export interface TransactionStorage {
  sql: SqlLike
  transactionSync<T>(callback: () => T): T
}

export function validateRoomId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9_-]{5,59}$/i.test(id)) {
    throw new DomainError(
      'INVALID_INPUT',
      'Room id must contain 6–60 safe characters',
    )
  }
}
export function validateActor(id: unknown): asserts id is string {
  if (typeof id !== 'string' || id.length < 2 || id.length > 200) {
    throw new DomainError('INVALID_INPUT', 'Authenticated identity is invalid')
  }
}
export async function hashInvitation(code: string): Promise<string> {
  const bytes = new TextEncoder().encode(code)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (x) =>
    x.toString(16).padStart(2, '0'),
  ).join('')
}
