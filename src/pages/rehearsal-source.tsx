import { useEffect, useState } from 'react'
import {
  ReleasedSource,
  type ReleaseListing,
} from '../components/ReleasedSource'
export default function SourcePage() {
  const [release, setRelease] = useState<ReleaseListing | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const abort = new AbortController()
    fetch('/release-source/listing.json', {
      signal: abort.signal,
      cache: 'no-cache',
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Source unavailable')
        setRelease(await res.json())
      })
      .catch(() => {
        if (!abort.signal.aborted) setFailed(true)
      })
    return () => abort.abort()
  }, [])
  return (
    <>
      <title>Rehearsal · Source code</title>
      {release ? (
        <ReleasedSource release={release} />
      ) : (
        <main>
          <h1>Rehearsal source</h1>
          {failed ? (
            <p>
              Unable to load the listing.{' '}
              <a href="/release-source/rehearsal.zip">
                Download the released source
              </a>
            </p>
          ) : (
            <p role="status">Loading released code…</p>
          )}
        </main>
      )}
    </>
  )
}
