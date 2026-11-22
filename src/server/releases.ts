import type { Context, Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import type { AppContext, Env } from '../../worker'
import {
  baseline,
  evaluate,
  isCustomer,
  isId,
  makeRelease,
  parseCommand,
  roomId,
  sameRequest,
  type Release,
  type StoredRelease,
} from '../rollout/model'
const cookie = 'rollcall_operator'
async function fingerprint(token: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)),
  )
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
async function ownerOf(env: Env, id: string): Promise<string | null> {
  if (!isId(id)) return null
  const result = await recordTool<{
    records: { data: { ownerHash: string } }[]
  }>(env, id, 'records.query', { collection: 'access', limit: 1 })
  if (!result.success) throw new Error('Could not read workspace access.')
  return result.data.records[0]?.data.ownerHash ?? null
}
async function roleFor(c: Context<AppContext>, id: string) {
  const owner = await ownerOf(c.env, id)
  if (!owner) return null
  const token = getCookie(c, cookie)
  return token && isId(token) && (await fingerprint(token)) === owner
    ? 'operator'
    : 'observer'
}
// This internal binding is the only write path. The client's RecordRoom permissions allow reading.
async function recordTool<T>(
  env: Env,
  id: string,
  tool: string,
  params: Record<string, unknown>,
) {
  const stub = env.RECORD_ROOMS.get(env.RECORD_ROOMS.idFromName(roomId(id)))
  const res = await stub.fetch('https://internal/api/tools/execute', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-User-Id': 'rollcall-worker',
      'X-App-Action': 'true',
    },
    body: JSON.stringify({
      tool,
      params,
    }),
  })
  return (await res.json()) as { success: boolean; data: T; error?: string }
}
async function journal(
  env: Env,
  id: string,
  limit: number,
  revision?: number,
): Promise<Release[]> {
  if (revision === 0) return [baseline]
  const res = await recordTool<{
    records: { data: StoredRelease; createdAt: string }[]
  }>(env, id, 'records.query', {
    collection: 'releases',
    orderBy: 'revision',
    orderDir: 'desc',
    limit,
    ...(revision === undefined ? {} : { where: { revision } }),
  })
  if (!res.success) throw new Error('Could not read the release journal.')
  return res.data.records.map((row) => ({
    ...row.data,
    createdAt: row.createdAt,
  }))
}
// Checkout and the CLI tool both read the current committed policy here.
export async function evaluatePublished(
  env: Env,
  id: string,
  customer: string,
) {
  if (!isCustomer(customer) || !(await ownerOf(env, id))) return null
  return evaluate(customer, (await journal(env, id, 1))[0] ?? baseline)
}
export function registerReleases(app: Hono<AppContext>) {
  app.use('/api/rollcall/*', async (c, next) => {
    c.header('Cache-Control', 'private, no-store')
    c.header('Vary', 'Cookie')
    const origin = c.req.header('origin')
    if (
      c.req.method !== 'GET' &&
      origin &&
      origin !== new URL(c.req.url).origin
    )
      return c.json({ error: 'Use this workspace’s own page.' }, 403)
    await next()
  })
  app.get('/api/rollcall/session', (c) => {
    if (!isId(getCookie(c, cookie)))
      setCookie(c, cookie, crypto.randomUUID(), {
        httpOnly: true,
        sameSite: 'Lax',
        secure: new URL(c.req.url).protocol === 'https:',
        maxAge: 60 * 60 * 24 * 90,
        path: '/',
      })
    return c.json({ ready: true })
  })
  app.put('/api/rollcall/workspaces/:id', async (c) => {
    const id = c.req.param('id'),
      token = getCookie(c, cookie)
    if (!isId(id)) return c.json({ error: 'Invalid workspace ID.' }, 400)
    if (!isId(token))
      return c.json({ error: 'Allow cookies to create a workspace.' }, 401)
    // A unique slot makes simultaneous workspace claims atomic inside its room.
    const claim = await recordTool(c.env, id, 'records.create', {
      collection: 'access',
      data: { slot: 'operator', ownerHash: await fingerprint(token) },
    })
    if (!claim.success && !claim.error?.startsWith('Duplicate:'))
      throw new Error('Could not register workspace.')
    const role = await roleFor(c, id)
    if (role !== 'operator')
      return c.json({ error: 'This workspace is already owned.' }, 409)
    return c.json({ id, role, history: await journal(c.env, id, 50) })
  })
  app.get('/api/rollcall/workspaces/:id', async (c) => {
    const id = c.req.param('id'),
      role = await roleFor(c, id)
    if (!role) return c.json({ error: 'Workspace not found.' }, 404)
    return c.json({ id, role, history: await journal(c.env, id, 50) })
  })
  app.get('/api/rollcall/workspaces/:id/evaluate', async (c) => {
    const id = c.req.param('id'),
      customer = c.req.query('customer')
    if (!isCustomer(customer))
      return c.json(
        {
          error:
            'Use a customer ID of 1–64 letters, numbers, dots, dashes or underscores.',
        },
        400,
      )
    const result = await evaluatePublished(c.env, id, customer)
    return result
      ? c.json(result)
      : c.json({ error: 'Workspace not found.' }, 404)
  })
  app.post('/api/rollcall/workspaces/:id/releases', async (c) => {
    const id = c.req.param('id'),
      role = await roleFor(c, id)
    if (!role) return c.json({ error: 'Workspace not found.' }, 404)
    if (role !== 'operator')
      return c.json(
        {
          error:
            'The workspace owner publishes releases. This link is read-only.',
        },
        403,
      )
    const cmd = parseCommand(await c.req.json().catch(() => null))
    if (!cmd) return c.json({ error: 'Invalid release command.' }, 400)
    // A retried command reads the prior acknowledgement. A different command for the same slot conflicts.
    async function replayOrConflict() {
      const existing = (await journal(c.env, id, 1, cmd!.base + 1))[0]
      return existing && sameRequest(existing, cmd!)
        ? c.json({ release: existing })
        : c.json(
            {
              error:
                'Another release was published. Review the latest revision.',
              code: 'stale',
            },
            409,
          )
    }
    const head = (await journal(c.env, id, 1))[0] ?? baseline
    if (head.revision !== cmd.base) return replayOrConflict()
    const target =
      cmd.kind === 'restore'
        ? (await journal(c.env, id, 1, cmd.target))[0]
        : undefined
    let row: StoredRelease
    try {
      row = makeRelease(cmd, head, target)
    } catch (e) {
      return c.json({ error: (e as Error).message }, 422)
    }
    const saved = await recordTool(c.env, id, 'records.create', {
      collection: 'releases',
      data: row,
    })
    if (!saved.success) {
      if (saved.error?.startsWith('Duplicate:')) return replayOrConflict()
      throw new Error('Could not append the release.')
    }
    const [release] = await journal(c.env, id, 1, row.revision)
    return c.json({ release }, 201)
  })
}
