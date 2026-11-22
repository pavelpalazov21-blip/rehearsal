import { useRef, useState, type ReactNode, type KeyboardEvent } from 'react'
import {
  Activity,
  ArrowRight,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  GitCommitHorizontal,
  Layers3,
  Radio,
  RotateCcw,
  Send,
} from 'lucide-react'
import {
  baseline,
  defaultCustomer,
  evaluate,
  FLAG,
  isCustomer,
  sameRequest,
  sample,
  type Command,
  type Release,
} from './model'
import { Receipt } from './Receipt'
import './rollcall.css'
export type DeskProps = {
  history: Release[]
  editable: boolean
  working?: boolean
  spaceId?: string
  local?: boolean
  connection?: ReactNode
  onRelease: (command: Command) => Promise<Release>
  onShare?: () => Promise<string>
  onNew?: () => void
  onRefresh?: () => Promise<Release[]>
}
type Draft = { percent: number; base: number; note: string }
const presets = [0, 10, 25, 50, 100]
const fmtTime = (r: Release) =>
  r.createdAt
    ? new Date(r.createdAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''
export function Mark() {
  return (
    <span className="rc-mark" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}
function stateLabel(bucket: number, live: number, draft: number) {
  const before = bucket < live * 100,
    after = bucket < draft * 100
  if (before && after) return 'retained'
  if (!before && after) return 'added'
  if (before && !after) return 'removed'
  return 'excluded'
}
export function Desk({
  history,
  editable,
  working = false,
  spaceId,
  local,
  connection,
  onRelease,
  onShare,
  onNew,
  onRefresh,
}: DeskProps) {
  const head = history[0] ?? baseline
  const [draft, setDraft] = useState<Draft | null>(null),
    [customer, setCustomer] = useState(defaultCustomer),
    [input, setInput] = useState(defaultCustomer)
  const [source, setSource] = useState<'draft' | 'live'>('draft'),
    [customerError, setCustomerError] = useState('')
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [busyShare, setBusyShare] = useState(false),
    [manualLink, setManualLink] = useState('')
  const percent = editable
    ? (draft?.percent ?? (head.revision === 0 ? 25 : head.percent))
    : head.percent
  const note = draft?.note ?? '',
    base = draft?.base ?? head.revision
  const stale = base !== head.revision
  const outstanding = useRef<{ signature: string; command: Command } | null>(
    null,
  )
  const grid = useRef<HTMLDivElement>(null)
  function edit(fields: Partial<Pick<Draft, 'percent' | 'note'>>) {
    setDraft({ percent, base, note, ...fields })
    setMessage('')
    outstanding.current = null
  }
  function inspect(id: string) {
    setCustomer(id)
    setInput(id)
    setCustomerError('')
  }
  const selected = evaluate(customer, {
    percent: source === 'draft' ? percent : head.percent,
    revision: head.revision,
  })
  const included = sample.filter((s) => s.bucket < percent * 100).length
  const affected = sample.filter(({ bucket }) => {
    const getsDraft = bucket < percent * 100
    const getsPublished = bucket < head.percent * 100
    return getsDraft !== getsPublished
  }).length
  const selectedIndex = sample.findIndex((s) => s.customer === customer)
  function moveFocus(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const cols = grid.current
      ? getComputedStyle(grid.current).gridTemplateColumns.split(' ').length
      : 10
    const offset: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: cols,
      ArrowUp: -cols,
    }
    if (!(e.key in offset)) return
    e.preventDefault()
    const next = Math.max(0, Math.min(sample.length - 1, index + offset[e.key]))
    inspect(sample[next].customer)
    grid.current?.querySelectorAll('button')[next]?.focus()
  }
  async function commit(target?: number) {
    if (busy || working || !editable) return
    const shape =
      target === undefined
        ? { kind: 'publish' as const, percent, base, note: note.trim() }
        : { kind: 'restore' as const, target, base: head.revision, note: '' }
    // Preserve the command key if an acknowledgement is lost. New intent gets a new key.
    const signature = JSON.stringify(shape)
    const previous = outstanding.current
    const command =
      previous?.signature === signature
        ? previous.command
        : { ...shape, requestId: crypto.randomUUID() }
    outstanding.current = { signature, command }
    setBusy(true)
    setMessage('')
    let saved: Release | undefined
    try {
      saved = await onRelease(command)
    } catch (e) {
      // The server may have committed before the browser lost its response.
      const rows = await onRefresh?.().catch(() => [])
      saved = rows?.find((row) => sameRequest(row, command))
      if (!saved) {
        setMessage(
          e instanceof Error
            ? e.message
            : 'The release could not be confirmed. Retry to check its status.',
        )
        return
      }
    } finally {
      setBusy(false)
    }
    setDraft(null)
    outstanding.current = null
    setMessage(
      saved.kind === 'restore'
        ? 'Restored revision ' + saved.target + ' at ' + saved.percent + '%.'
        : 'Published ' +
            saved.percent +
            '% as revision ' +
            saved.revision +
            '.',
    )
  }
  async function share() {
    if (!onShare || busyShare) return
    setBusyShare(true)
    try {
      const link = await onShare()
      try {
        await navigator.clipboard.writeText(link)
        setMessage('Observer link copied.')
      } catch {
        setManualLink(link)
      }
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : 'Could not create the observer link.',
      )
    } finally {
      setBusyShare(false)
    }
  }
  return (
    <main className="rc">
      <header className="rc-top">
        <div className="rc-nav">
          <div className="rc-word">
            <Mark />
            Rollcall
          </div>
          <div className="rc-top-actions">
            {connection && <span className="presence">{connection}</span>}
            {local && <span className="rc-pill">Local preview</span>}
            {onNew && (
              <button className="top-link" onClick={onNew} disabled={busy}>
                New workspace
              </button>
            )}
            {onShare && (
              <button
                className="share"
                onClick={share}
                disabled={busyShare || busy || working}
              >
                <Copy size={14} />
                {busyShare ? 'Preparing…' : 'Share view'}
              </button>
            )}
          </div>
        </div>
      </header>
      <div className="rc-page">
        {manualLink && (
          <label className="link-field">
            Observer link
            <input
              value={manualLink}
              readOnly
              onFocus={(e) => e.target.select()}
            />
          </label>
        )}
        <div className="rc-intro">
          <div>
            <div className="crumb">
              <Layers3 size={14} />
              Checkout <ChevronRight size={12} />
              Feature flags
            </div>
            <h1>Price breakdown</h1>
            <p>
              Release an itemized receipt to a percentage of your customers.
            </p>
          </div>
          <div className="flag-tag">
            <span className="status-dot" />
            <code>{FLAG}</code>
          </div>
        </div>
        <div className="rc-grid">
          <section className="rc-panel controls">
            <div className="panel-title">
              <h2>Rollout control</h2>
              <span className="sub-tag">
                {editable ? 'Operator' : 'Read only'}
              </span>
            </div>
            <div className="live-strip">
              <span>
                <Radio size={15} />
                Published
              </span>
              <strong>{head.percent}%</strong>
              <code>rev {head.revision}</code>
            </div>
            <label htmlFor="draft-range" className="field-title">
              {editable ? 'Draft rollout' : 'Current rollout'}
            </label>
            <div className="large-percent">
              {percent}
              <span>%</span>
            </div>
            <input
              id="draft-range"
              type="range"
              min={0}
              max={100}
              step={1}
              value={percent}
              disabled={!editable || busy}
              onChange={(e) => edit({ percent: Number(e.target.value) })}
              style={{
                background:
                  'linear-gradient(to right, #4936ab ' +
                  percent +
                  '%, #dedde9 ' +
                  percent +
                  '%)',
              }}
            />
            <div className="presets" aria-label="Rollout presets">
              {presets.map((n) => (
                <button
                  key={n}
                  aria-pressed={percent === n}
                  disabled={!editable || busy}
                  onClick={() => edit({ percent: n })}
                >
                  {n}%
                </button>
              ))}
            </div>
            {editable ? (
              <>
                <label className="reason">
                  Release note <small>optional</small>
                  <input
                    aria-label="Release note"
                    maxLength={160}
                    placeholder="Why change the rollout?"
                    value={note}
                    onChange={(e) => edit({ note: e.target.value })}
                    disabled={busy}
                  />
                </label>
                {stale && (
                  <div className="conflict" role="alert">
                    Revision {head.revision} arrived while you were editing.{' '}
                    <button
                      onClick={() => {
                        setDraft({ percent, note, base: head.revision })
                        outstanding.current = null
                      }}
                    >
                      Review against revision {head.revision}
                    </button>
                  </div>
                )}
                <button
                  className="publish"
                  disabled={
                    busy || working || stale || percent === head.percent
                  }
                  onClick={() => void commit()}
                >
                  <Send size={15} />
                  {busy ? 'Saving release…' : 'Publish ' + percent + '%'}
                  <ArrowRight size={16} />
                </button>
              </>
            ) : (
              <p className="caption">
                This observer link follows the published release.
              </p>
            )}
          </section>
          <section className="rc-panel audience">
            <div className="panel-title">
              <h2>Audience preview</h2>
              <span className="sub-tag">100 test IDs</span>
            </div>
            <div className="impact">
              <strong>
                {included}
                <span> / 100</span>
              </strong>
              <span>receive the breakdown</span>
            </div>
            <div ref={grid} className="cohort-grid" aria-label="Test customers">
              {sample.map((s, i) => {
                const state = stateLabel(s.bucket, head.percent, percent)
                return (
                  <button
                    key={s.customer}
                    data-state={state}
                    className={s.customer === customer ? 'inspected' : ''}
                    aria-label={'Inspect ' + s.customer + ', ' + state}
                    aria-pressed={s.customer === customer}
                    tabIndex={
                      i === (selectedIndex < 0 ? 0 : selectedIndex) ? 0 : -1
                    }
                    title={s.customer + ' · bucket ' + s.bucket + ' · ' + state}
                    onClick={() => inspect(s.customer)}
                    onKeyDown={(e) => moveFocus(e, i)}
                  />
                )
              })}
            </div>
            <div className="legend">
              {[
                ['retained', 'Included'],
                ['added', 'Would gain'],
                ['removed', 'Would lose'],
                ['excluded', 'Excluded'],
              ].map(([s, t]) => (
                <span key={s}>
                  <i data-state={s} />
                  {t}
                </span>
              ))}
            </div>
            <div className="impact-foot">
              <Activity size={16} />
              {affected
                ? affected + ' of these shoppers would switch experience.'
                : 'No shoppers in this sample would switch experience.'}
            </div>
            <p className="caption">
              Each ID keeps a fixed bucket. The sample count can differ from the
              target percentage.
            </p>
          </section>
        </div>
        {message && (
          <p role="status" className="rc-message">
            {message}
          </p>
        )}
        <div className="rc-grid lower">
          <section className="rc-panel inspector">
            <div className="panel-title">
              <h2>Customer inspector</h2>
            </div>
            <form
              className="customer-form"
              onSubmit={(e) => {
                e.preventDefault()
                if (!isCustomer(input.trim())) {
                  setCustomerError(
                    'Use 1–64 letters, numbers, dots, dashes or underscores.',
                  )
                  return
                }
                inspect(input.trim())
              }}
            >
              <label>
                Customer ID
                <input
                  value={input}
                  maxLength={64}
                  aria-label="Customer ID"
                  onChange={(e) => setInput(e.target.value)}
                />
              </label>
              <button type="submit" className="secondary">
                Inspect
              </button>
            </form>
            {customerError && <p role="alert">{customerError}</p>}
            {editable ? (
              <div className="scope-tabs" aria-label="Receipt policy">
                {(['draft', 'live'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSource(s)}
                    aria-pressed={s === source}
                  >
                    {s === 'draft' ? 'Draft receipt' : 'Published receipt'}
                  </button>
                ))}
              </div>
            ) : (
              <div className="receipt-policy-label">Published receipt</div>
            )}
            <Receipt enabled={selected.enabled} />
            <p className="explain">
              <code>{customer}</code> is in bucket <b>{selected.bucket}</b>.
              Buckets below <b>{selected.percent * 100}</b> see the breakdown.
            </p>
            {(spaceId || local) && (
              <a
                className="consumer-link"
                href={
                  local
                    ? '#shopper=' + encodeURIComponent(customer)
                    : '?space=' +
                      spaceId +
                      '&customer=' +
                      encodeURIComponent(customer)
                }
                target={local ? '_self' : '_blank'}
                rel="noreferrer"
              >
                {local ? 'Open checkout preview' : 'Open live checkout'}{' '}
                <ExternalLink size={13} />
              </a>
            )}
          </section>
          <section className="rc-panel history">
            <div className="panel-title">
              <h2>Release history</h2>
              <span className="sub-tag">Latest 50</span>
            </div>
            <ol>
              {[...history, baseline].map((r) => (
                <li key={r.revision}>
                  <span
                    className={
                      'event-icon ' +
                      (r.revision === head.revision ? 'latest' : '')
                    }
                  >
                    <GitCommitHorizontal size={16} />
                  </span>
                  <div>
                    <div className="event-title">
                      <b>
                        {r.revision === 0
                          ? 'Initial release'
                          : r.kind === 'restore'
                            ? 'Restored r' + r.target
                            : 'Published ' + r.percent + '%'}
                      </b>
                      <code>r{r.revision}</code>
                      {r.revision === head.revision && (
                        <span className="live-badge">
                          <Check size={10} />
                          Live
                        </span>
                      )}
                    </div>
                    <p>
                      {r.revision > 0
                        ? r.previous + '% → ' + r.percent + '%'
                        : ''}
                      {r.note && (r.revision ? ' · ' : '') + r.note}
                    </p>
                    <time dateTime={r.createdAt}>{fmtTime(r)}</time>
                  </div>
                  {editable &&
                    r.revision < head.revision &&
                    r.percent !== head.percent && (
                      <button
                        className="restore"
                        disabled={busy || working}
                        onClick={() => void commit(r.revision)}
                        aria-label={
                          'Restore revision ' +
                          r.revision +
                          ' at ' +
                          r.percent +
                          '%'
                        }
                      >
                        <RotateCcw size={13} />
                        Restore
                      </button>
                    )}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </main>
  )
}
