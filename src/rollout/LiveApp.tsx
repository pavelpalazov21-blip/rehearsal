import { useCallback, useEffect, useRef, useState } from 'react'
import { Desk, Mark } from './Desk'
import { Wire } from './Wire'
import { Receipt } from './Receipt'
import { api } from './api'
import {
  isCustomer,
  isId,
  mergeHistory,
  type Command,
  type Evaluation,
  type Release,
  type Space,
} from './model'
function LiveCheckout({ id, customer }: { id: string; customer: string }) {
  const [data, setData] = useState<Evaluation | null>(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0)
  const sync = useCallback((rows: Release[]) => {
    if (rows[0]) setRevision((r) => Math.max(r, rows[0].revision))
  }, [])
  useEffect(() => {
    let current = true
    async function read() {
      try {
        const result = await api<Evaluation>(
          'workspaces/' +
            id +
            '/evaluate?customer=' +
            encodeURIComponent(customer),
        )
        if (current) {
          setData((old) =>
            !old || result.revision >= old.revision ? result : old,
          )
          setError('')
        }
      } catch (e) {
        if (current) setError((e as Error).message)
      }
    }
    void read()
    window.addEventListener('focus', read)
    return () => {
      current = false
      window.removeEventListener('focus', read)
    }
  }, [id, customer, revision])
  return (
    <main className="rc">
      <article className="consumer">
        <div className="consumer-brand">
          <Mark />
          <b>Rollcall / Live checkout</b>
        </div>
        <h1>Shopping basket</h1>
        <p className="consumer-meta">
          <code>{customer}</code>
        </p>
        {data ? (
          <>
            <Receipt enabled={data.enabled} />
            <p className="consumer-meta">
              Published policy r{data.revision} · {data.percent}% rollout ·
              bucket {data.bucket}
            </p>
            <span className="consumer-meta">
              <Wire id={id} sync={sync} />
            </span>
            <p>
              <a
                href={
                  '/api/rollcall/workspaces/' +
                  id +
                  '/evaluate?customer=' +
                  encodeURIComponent(customer)
                }
              >
                View evaluation JSON
              </a>
            </p>
          </>
        ) : (
          <p>Reading the published flag…</p>
        )}
        {error && <p role="alert">{error}</p>}
        <a href={'?space=' + id}>Open release console</a>
      </article>
    </main>
  )
}
type Location = { id: string | null; customer: string | null }
function readLocation(): Location {
  const p = new URLSearchParams(location.search)
  return { id: p.get('space'), customer: p.get('customer') }
}
function Console({
  id,
  change,
}: {
  id: string | null
  change: (l: Location) => void
}) {
  const [space, setSpace] = useState<Space | null>(null),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0)
  const creating = useRef<Promise<Space> | null>(null),
    requestId = useRef<string | null>(null)
  const initial = useRef<Space | null>(null)
  const sync = useCallback(
    (rows: Release[]) =>
      setSpace((s) => {
        if (!s) return s
        const history = mergeHistory(s.history, rows)
        return history === s.history ? s : { ...s, history }
      }),
    [],
  )
  useEffect(() => {
    let current = true
    setError('')
    if (!id) {
      setSpace(null)
      creating.current = null
      requestId.current = null
      initial.current = null
      return
    }
    if (initial.current?.id === id) {
      initial.current = null
      return
    }
    if (!isId(id)) {
      setError('Invalid workspace link.')
      return
    }
    api<Space>('workspaces/' + id)
      .then((next) => {
        if (current)
          setSpace((old) =>
            old?.id === next.id
              ? { ...next, history: mergeHistory(old.history, next.history) }
              : next,
          )
      })
      .catch((e) => {
        if (current) setError(e.message)
      })
    return () => {
      current = false
    }
  }, [id, retry])
  async function ensure(): Promise<Space> {
    if (space && space.id === id) return space
    if (id) throw new Error('Wait for this workspace to load.')
    if (creating.current) return creating.current
    requestId.current ??= crypto.randomUUID()
    const newId = requestId.current
    creating.current = (async () => {
      await api('session')
      const s = await api<Space>('workspaces/' + newId, 'PUT')
      initial.current = s
      setSpace(s)
      window.history.replaceState({}, '', '?space=' + s.id)
      change({ id: s.id, customer: null })
      return s
    })()
    try {
      return await creating.current
    } finally {
      creating.current = null
    }
  }
  async function publish(c: Command) {
    const s = await ensure()
    const { release } = await api<{ release: Release }>(
      'workspaces/' + s.id + '/releases',
      'POST',
      c,
    )
    sync([release])
    return release
  }
  async function refresh() {
    const active = id ?? requestId.current
    if (!active) return []
    const s = await api<Space>('workspaces/' + active)
    sync(s.history)
    return s.history
  }
  if (id && space?.id !== id)
    return (
      <main className="rc">
        <div className="error-panel">
          <h1>Release workspace</h1>
          <p role="status">{error || 'Opening workspace…'}</p>
          {error && (
            <>
              <button
                className="secondary"
                onClick={() => setRetry((n) => n + 1)}
              >
                Retry
              </button>{' '}
              <a href="/">Start a new workspace</a>
            </>
          )}
        </div>
      </main>
    )
  return (
    <Desk
      history={space?.history ?? []}
      editable={space?.role !== 'observer'}
      spaceId={space?.id}
      connection={space ? <Wire id={space.id} sync={sync} /> : null}
      onRelease={publish}
      onRefresh={refresh}
      onShare={async () => {
        const s = await ensure()
        return new URL('?space=' + s.id, location.href).href
      }}
      onNew={
        space
          ? () => {
              window.location.assign(location.pathname)
            }
          : undefined
      }
    />
  )
}
export function LiveApp() {
  const [l, setLocation] = useState<Location>({ id: null, customer: null })
  useEffect(() => {
    const update = () => setLocation(readLocation())
    update()
    window.addEventListener('popstate', update)
    return () => window.removeEventListener('popstate', update)
  }, [])
  if (l.customer !== null)
    return l.id && isId(l.id) && isCustomer(l.customer) ? (
      <LiveCheckout key={l.id + l.customer} id={l.id} customer={l.customer} />
    ) : (
      <main className="rc">
        <div className="error-panel">
          <h1>Invalid checkout link</h1>
          <a href="/">Open the console</a>
        </div>
      </main>
    )
  return <Console id={l.id} change={setLocation} />
}
