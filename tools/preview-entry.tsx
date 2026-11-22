import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Desk, Mark } from '../src/rollout/Desk'
import { Receipt } from '../src/rollout/Receipt'
import {
  baseline,
  evaluate,
  isCustomer,
  makeRelease,
  sameRequest,
  type Command,
  type Release,
} from '../src/rollout/model'

const storageKey = 'rollcall.preview.v1'
let memory: Release[] = []
let storage: Storage | null = null
try {
  storage = window.localStorage
  storage.getItem(storageKey)
} catch {
  storage = null
}

function readHistory(): Release[] {
  if (!storage) return memory
  try {
    const saved = JSON.parse(storage.getItem(storageKey) ?? '[]')
    if (Array.isArray(saved)) memory = saved
  } catch {
    // The preview can still be used when a file viewer disables browser storage.
    storage = null
  }
  return memory
}

function selectedCustomer() {
  const value = new URLSearchParams(location.hash.slice(1)).get('shopper')
  return isCustomer(value) ? value : null
}

function OfflineApp() {
  const [history, setHistory] = useState(readHistory)
  const [customer, setCustomer] = useState(selectedCustomer)
  useEffect(() => {
    function refresh(event: StorageEvent) {
      if (event.key === storageKey || event.key === null)
        setHistory(readHistory())
    }
    function route() {
      setCustomer(selectedCustomer())
      window.scrollTo(0, 0)
    }
    window.addEventListener('storage', refresh)
    window.addEventListener('hashchange', route)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('hashchange', route)
    }
  }, [])

  async function commit(command: Command): Promise<Release> {
    function append() {
      const rows = readHistory()
      const alreadySaved = rows.find((row) => sameRequest(row, command))
      if (alreadySaved) return alreadySaved
      const target =
        command.kind === 'restore'
          ? command.target === 0
            ? baseline
            : rows.find((row) => row.revision === command.target)
          : undefined
      const release = {
        ...makeRelease(command, rows[0] ?? baseline, target),
        createdAt: new Date().toISOString(),
      }
      memory = [release, ...rows]
      if (storage) {
        try {
          storage.setItem(storageKey, JSON.stringify(memory))
        } catch {
          storage = null
        }
      }
      setHistory(memory)
      return release
    }
    return navigator.locks
      ? navigator.locks.request(storageKey, append)
      : append()
  }

  const result = customer ? evaluate(customer, history[0] ?? baseline) : null
  return (
    <>
      <div hidden={!!result}>
        <Desk
          history={history.slice(0, 50)}
          editable
          local
          onRelease={commit}
          onRefresh={async () => {
            const rows = readHistory()
            setHistory(rows)
            return rows
          }}
        />
      </div>
      {result && (
        <main className="rc">
          <article className="consumer">
            <div className="consumer-brand">
              <Mark />
              <b>Rollcall / Checkout preview</b>
            </div>
            <h1>Shopping basket</h1>
            <p className="consumer-meta">
              <code>{customer}</code>
            </p>
            <Receipt enabled={result.enabled} />
            <p className="consumer-meta">
              Published policy r{result.revision} · {result.percent}% rollout ·
              bucket {result.bucket}
            </p>
            <a href="#">Return to release console</a>
          </article>
        </main>
      )}
    </>
  )
}

createRoot(document.getElementById('root')!).render(<OfflineApp />)
