import type { ToolSet } from 'ai'

// Studio coaching uses the authenticated room action and has no write tools.
export function buildTools(): ToolSet {
  return {}
}
