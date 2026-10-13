import { AGENT_TOOL_CONTRACTS } from '@aedifex/core/agent-tools'
import type { GeometryScriptLanguage } from '@aedifex/core'
import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import { z } from 'zod'

export type SharedAgentToolName = (typeof AGENT_TOOL_CONTRACTS)[number]['name']

export const sharedAgentContracts = new Map(
  AGENT_TOOL_CONTRACTS.map((contract) => [contract.name, contract]),
)

export function getSharedOpenAITools(
  options: { languages?: readonly GeometryScriptLanguage[]; clearScene?: boolean } = {},
): ChatCompletionTool[] {
  const bpy = options.languages?.includes('bpy') === true
  return AGENT_TOOL_CONTRACTS.filter(
    (contract) => contract.name !== 'clear_scene' || options.clearScene === true,
  ).map((contract) => ({
    type: 'function',
    function: {
      name: contract.name,
      description: bpy
        ? contract.description
        : contract.description.replace(/\n\nBlender instead[\s\S]*?(?=\n\nEdit:)/, ''),
      parameters: z.toJSONSchema(
        z.object({
          ...contract.input,
          ...(!bpy && 'language' in contract.input
            ? {
                language: z
                  .literal('three')
                  .optional()
                  .describe(
                    'A three.js module. Reading saved Python source is supported, but this host cannot execute it.',
                  ),
              }
            : {}),
        }),
        { io: 'input' },
      ),
    },
  }))
}

export const SHARED_OPENAI_TOOLS: ChatCompletionTool[] = getSharedOpenAITools()

export function isSharedAgentToolName(name: string): name is SharedAgentToolName {
  return sharedAgentContracts.has(name as SharedAgentToolName)
}
