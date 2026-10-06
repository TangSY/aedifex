import { AGENT_TOOL_CONTRACTS } from '@aedifex/core/agent-tools'
import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import { z } from 'zod'

export type SharedAgentToolName = (typeof AGENT_TOOL_CONTRACTS)[number]['name']

export const sharedAgentContracts = new Map(
  AGENT_TOOL_CONTRACTS.map((contract) => [contract.name, contract]),
)

export const SHARED_OPENAI_TOOLS: ChatCompletionTool[] = AGENT_TOOL_CONTRACTS.map((contract) => ({
  type: 'function',
  function: {
    name: contract.name,
    description: contract.description,
    parameters: z.toJSONSchema(z.object(contract.input), { io: 'input' }),
  },
}))

export function isSharedAgentToolName(name: string): name is SharedAgentToolName {
  return sharedAgentContracts.has(name as SharedAgentToolName)
}
