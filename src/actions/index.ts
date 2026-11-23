import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'

import { studioActions } from '../rehearsal/studio-actions'

export const actions: Record<string, ActionHandler<Env>> = { ...studioActions }
