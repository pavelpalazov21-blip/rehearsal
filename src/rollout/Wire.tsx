import { useEffect } from 'react'
import {
  DeepSpaceAuthProvider,
  RecordProvider,
  RecordScope,
  usePresenceRoom,
  useQuery,
} from 'deepspace'
import { Radio } from 'lucide-react'
import { schemas } from '../schemas'
import { roomId, type StoredRelease, type Release } from './model'
type Props = { id: string; sync: (rows: Release[]) => void }
function Subscription({ id, sync }: Props) {
  const { records, status } = useQuery<StoredRelease>('releases', {
    orderBy: 'revision',
    orderDir: 'desc',
    limit: 50,
  })
  const { peers, connected } = usePresenceRoom('rollcall-presence-' + id)
  useEffect(() => {
    if (status === 'ready')
      sync(records.map((r) => ({ ...r.data, createdAt: r.createdAt })))
  }, [records, status, sync])
  return (
    <>
      <Radio size={14} />
      {status === 'error'
        ? 'Feed unavailable'
        : !connected || status !== 'ready'
          ? 'Connecting…'
          : peers.length + 1 + ' online'}
    </>
  )
}
export function Wire(props: Props) {
  return (
    <DeepSpaceAuthProvider>
      <RecordProvider allowAnonymous>
        <RecordScope roomId={roomId(props.id)} schemas={schemas}>
          <Subscription {...props} />
        </RecordScope>
      </RecordProvider>
    </DeepSpaceAuthProvider>
  )
}
