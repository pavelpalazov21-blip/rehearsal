import { AuthGate, DeepSpaceAuthProvider } from 'deepspace'
import Studio from '../rehearsal/Studio'
export default function IncidentRoom() {
  return (
    <DeepSpaceAuthProvider>
      <AuthGate>
        <Studio />
      </AuthGate>
    </DeepSpaceAuthProvider>
  )
}
