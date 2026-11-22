import { tool, type ToolSet } from 'ai'
import { z } from 'zod/v4'
import type { AgentToolContext, UserToolExecutor } from 'deepspace/worker'
import type { Env } from '../../worker'
import { evaluatePublished } from '../server/releases'
import { isCustomer, isId } from '../rollout/model'

export function buildTools(
  _executor: UserToolExecutor,
  context: AgentToolContext<Env>,
): ToolSet {
  return {
    evaluate_checkout: tool({
      description:
        'Look up one customer in a Rollcall workspace. Returns the committed revision, percentage, bucket and whether checkout shows an itemized receipt. Copy the workspace UUID from its observer URL.',
      inputSchema: z.object({
        workspace: z.string().refine(isId, 'Expected a workspace UUID'),
        customer: z.string().refine(isCustomer, 'Expected a valid customer ID'),
      }),
      execute: async ({ workspace, customer }) =>
        (await evaluatePublished(context.env, workspace, customer)) ?? {
          error: 'Workspace not found.',
        },
    }),
  }
}
