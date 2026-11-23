import type { StudioView } from './studio/engine'
import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { scenarioSummary } from './studio/scenarios'

type Operation =
  'initialize' | 'join' | 'snapshot' | 'evidence' | 'command' | 'message'

/** Only forward fixed operations to this app's private room binding. */
function roomAction(operation: Operation): ActionHandler<Env> {
  return async ({ env, callerJwt, userId, params }) => {
    if (!userId || userId.startsWith('anon-'))
      return { success: false, error: 'Sign in required', status: 401 }
    const roomId =
      operation === 'initialize'
        ? 'rh-' + crypto.randomUUID().replaceAll('-', '')
        : params.roomId
    if (typeof roomId !== 'string' || !/^rh-[0-9a-f]{32}$/.test(roomId)) {
      return { success: false, error: 'Invalid room identifier', status: 400 }
    }
    const stub = env.REHEARSAL_STUDIO_ROOMS.get(
      env.REHEARSAL_STUDIO_ROOMS.idFromName(roomId),
    )
    const res = await stub.fetch('https://studio.internal/' + operation, {
      method: operation === 'snapshot' ? 'GET' : 'POST',
      headers: {
        Authorization: 'Bearer ' + callerJwt,
        'X-Rehearsal-Room': roomId,
        'Content-Type': 'application/json',
      },
      body:
        operation === 'snapshot'
          ? undefined
          : JSON.stringify({ ...params, roomId }),
    })
    const result = await res.json<{
      data?: unknown
      error?: string
      code?: string
    }>()
    if (!res.ok)
      return {
        success: false,
        error: result.error ?? 'Room unavailable',
        status: res.status,
        code: result.code,
      }
    return {
      success: true,
      data: operation === 'initialize' ? result : result.data,
    }
  }
}
export const studioActions: Record<string, ActionHandler<Env>> = {
  studioScenarios: async ({ userId }) =>
    userId && !userId.startsWith('anon-')
      ? { success: true, data: scenarioSummary() }
      : { success: false, error: 'Sign in required', status: 401 },
  studioCoach: async (ctx) => {
    const snapshot = await roomAction('snapshot')(ctx)
    if (!snapshot.success) return snapshot
    const view = snapshot.data as StudioView
    const hint =
      view.phase === 'complete'
        ? view.debrief!.lesson
        : view.role === 'comms'
          ? 'Read the customer reports. Tell the team what users can observe before publishing an update.'
          : view.progress.recovery === 'submitted'
            ? 'Compare both proposed files with the originals. Explain one edge case the repair now handles.'
            : view.js.task && view.progress.inspected
              ? view.js.task
              : 'Run status first. Ask the engineer which log entry and deployment change point to the same cause.'
    if (ctx.env.REHEARSAL_AI_COACH === 'enabled') {
      try {
        const result = await ctx.tools.integration<{
          choices?: { message?: { content?: string } }[]
          content?: string
        }>('openai/chat-completion', {
          model: 'gpt-4o-mini',
          max_tokens: 110,
          messages: [
            {
              role: 'system',
              content:
                'Give one short Socratic debugging hint. Use the supplied fictional incident facts. Do not provide code or assert recovery.',
            },
            {
              role: 'user',
              content: JSON.stringify({
                incident: view.scenario.title,
                role: view.role,
                phase: view.phase,
                guidance: hint,
              }),
            },
          ],
        })
        if (result.success) {
          const answer =
            result.data?.choices?.[0]?.message?.content ?? result.data?.content
          if (typeof answer === 'string' && answer.trim())
            return {
              success: true,
              data: { label: 'AI coach', text: answer.trim().slice(0, 700) },
            }
        }
      } catch {
        /* The authored hint remains available if the provider fails. */
      }
    }
    return { success: true, data: { label: 'Scenario guide', text: hint } }
  },
  studioCreate: roomAction('initialize'),
  studioJoin: roomAction('join'),
  studioSnapshot: roomAction('snapshot'),
  studioEvidence: roomAction('evidence'),
  studioCommand: roomAction('command'),
  studioMessage: roomAction('message'),
}
