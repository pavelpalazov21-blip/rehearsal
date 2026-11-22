export const FLAG = 'checkout.price-breakdown'
export const AUDIENCE = Array.from(
  { length: 100 },
  (_, i) => 'shopper-' + String(i + 1).padStart(3, '0'),
)
export const roomId = (id: string) => 'rollcall-' + id
export type Kind = 'publish' | 'restore'
export type Release = {
  revision: number
  percent: number
  previous: number
  kind: Kind
  target: number
  note: string
  requestId: string
  createdAt: string
}
export type StoredRelease = Omit<Release, 'createdAt'>
export type Command = { base: number; requestId: string; note: string } & (
  | { kind: 'publish'; percent: number }
  | { kind: 'restore'; target: number }
)
export type Space = {
  id: string
  role: 'operator' | 'observer'
  history: Release[]
}
export type Evaluation = {
  flag: string
  customer: string
  revision: number
  percent: number
  bucket: number
  enabled: boolean
}

export const baseline: Release = {
  revision: 0,
  percent: 0,
  previous: 0,
  kind: 'publish',
  target: -1,
  note: 'Original total-only receipt.',
  requestId: 'baseline',
  createdAt: '',
}
export const isId = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value)
export const isCustomer = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(value)
export function isPercent(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 100
}
// FNV-1a on UTF-8, followed by a 32-bit avalanche. The percentage never participates in the hash.
export function bucketFor(customer: string, flag = FLAG): number {
  let hash = 2166136261
  for (const byte of new TextEncoder().encode(flag + '\u0000' + customer))
    hash = Math.imul(hash ^ byte, 16777619)
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b)
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35)
  return ((hash ^ (hash >>> 16)) >>> 0) % 10000
}
export function evaluate(
  customer: string,
  release: Pick<Release, 'revision' | 'percent'>,
): Evaluation {
  const bucket = bucketFor(customer)
  return {
    flag: FLAG,
    customer,
    revision: release.revision,
    percent: release.percent,
    bucket,
    enabled: bucket < release.percent * 100,
  }
}
export const sample = AUDIENCE.map((customer) => ({
  customer,
  bucket: bucketFor(customer),
}))
export const defaultCustomer = sample.find((s) => s.bucket < 2500)!.customer
export function parseCommand(value: unknown): Command | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (
    !isId(v.requestId) ||
    !Number.isSafeInteger(v.base) ||
    Number(v.base) < 0 ||
    typeof v.note !== 'string' ||
    v.note.length > 160
  )
    return null
  const common = {
    requestId: v.requestId,
    base: Number(v.base),
    note: v.note.trim(),
  }
  if (v.kind === 'publish' && isPercent(v.percent))
    return { ...common, kind: 'publish', percent: v.percent }
  if (
    v.kind === 'restore' &&
    Number.isSafeInteger(v.target) &&
    Number(v.target) >= 0 &&
    Number(v.target) < common.base
  )
    return { ...common, kind: 'restore', target: Number(v.target) }
  return null
}
export function sameRequest(row: Release, c: Command) {
  return (
    row.requestId === c.requestId &&
    row.revision === c.base + 1 &&
    row.kind === c.kind &&
    row.note === c.note &&
    (c.kind === 'publish' ? row.percent === c.percent : row.target === c.target)
  )
}
export function makeRelease(
  c: Command,
  head: Release,
  target?: Release,
): StoredRelease {
  if (c.base !== head.revision)
    throw new Error('This draft is based on an older revision.')
  if (c.kind === 'restore' && (!target || target.revision !== c.target))
    throw new Error('That revision is unavailable.')
  const percent = c.kind === 'publish' ? c.percent : target!.percent
  if (percent === head.percent)
    throw new Error('The live percentage already matches this release.')
  return {
    revision: head.revision + 1,
    percent,
    previous: head.percent,
    kind: c.kind,
    target: c.kind === 'restore' ? c.target : -1,
    note: c.note,
    requestId: c.requestId,
  }
}
export function mergeHistory(
  current: Release[],
  incoming: Release[],
): Release[] {
  const byRevision = new Map(current.map((r) => [r.revision, r]))
  let changed = false
  for (const r of incoming)
    if (!byRevision.has(r.revision)) {
      byRevision.set(r.revision, r)
      changed = true
    }
  return changed
    ? Array.from(byRevision.values())
        .sort((a, b) => b.revision - a.revision)
        .slice(0, 50)
    : current
}
