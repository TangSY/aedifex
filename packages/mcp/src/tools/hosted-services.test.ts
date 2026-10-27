import { describe, expect, test } from 'bun:test'
import type { HostedServiceExecutor, HostedServiceRequest } from '@aedifex/core/agent-operations'
import { AgentRefusal } from '@aedifex/core/agent-tools'
import { Client } from '@modelcontextprotocol/client'
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server'
import { registerHostedServiceTools } from './hosted-services'

type Content = { type: string; text?: string; data?: string; mimeType?: string }

async function withClient(execute: HostedServiceExecutor, run: (client: Client) => Promise<void>) {
  const server = new McpServer({ name: 'hosted-services-test', version: '1.0.0' })
  registerHostedServiceTools(server, execute)
  const client = new Client({ name: 'service-consumer', version: '1.0.0' })
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  try {
    await run(client)
  } finally {
    await client.close()
    await server.close()
  }
}

async function serve(answer: (request: HostedServiceRequest) => unknown) {
  const asked: HostedServiceRequest[] = []
  const server = new McpServer({ name: 'services', version: '1' })
  registerHostedServiceTools(server, async (request) => {
    asked.push(request)
    return answer(request)
  })
  const [a, b] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'services', version: '1' })
  await Promise.all([server.connect(a), client.connect(b)])
  return {
    asked,
    call: async (name: string, args: Record<string, unknown>) =>
      ((await client.callTool({ name, arguments: args })).content ?? []) as Content[],
    close: () => Promise.all([client.close(), server.close()]),
  }
}

describe('hosted service tools over the MCP', () => {
  test('advertises only released actions with truthful side effects and retry semantics', async () => {
    await withClient(
      async () => {
        throw new Error('discovery must not execute a service')
      },
      async (client) => {
        const { tools } = await client.listTools()
        expect(tools.map(({ name }) => name).sort()).toEqual([
          'generate_studio_media',
          'get_site_pull',
          'get_studio_generation',
          'list_pascal_services',
          'pull_site_data',
        ])
        expect(
          tools.find(({ name }) => name === 'list_pascal_services')!.annotations,
        ).toMatchObject({ readOnlyHint: true })
        expect(tools.find(({ name }) => name === 'pull_site_data')!.annotations).toMatchObject({
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
        })
        expect(
          tools.find(({ name }) => name === 'generate_studio_media')!.annotations,
        ).toMatchObject({ readOnlyHint: false, destructiveHint: true, idempotentHint: true })
        expect(
          tools.find(({ name }) => name === 'get_studio_generation')!.annotations,
        ).toMatchObject({ readOnlyHint: false, destructiveHint: false })
      },
    )
  })

  test("a render's preview comes back as a picture beside its job, never inside the JSON", async () => {
    const pixels = Buffer.from('webp').toString('base64')
    const services = await serve(() => ({
      id: 'render_1',
      status: 'completed',
      image_url: 'https://example.invalid/render_1.png',
      preview: `data:image/webp;base64,${pixels}`,
    }))
    try {
      const content = await services.call('get_studio_generation', {
        id: 'render_1',
        includePreview: true,
      })
      expect(services.asked[0]).toMatchObject({
        action: 'studio.status',
        input: { id: 'render_1', includePreview: true },
      })
      expect(services.asked[0]!.pluginId).toBeUndefined()
      expect(JSON.parse(content[0]!.text!)).toEqual({
        id: 'render_1',
        status: 'completed',
        image_url: 'https://example.invalid/render_1.png',
      })
      expect(content[1]).toEqual({ type: 'image', data: pixels, mimeType: 'image/webp' })
    } finally {
      await services.close()
    }
  })

  test('forwards the service result and bounded request through the real protocol', async () => {
    await withClient(
      async (request) => {
        expect(request).toMatchObject({
          action: 'studio.generate',
          pluginId: 'aedifex:architect',
          projectId: 'project_media_test',
          maxCredits: 20,
          input: { modelId: 'available-model', prompt: 'Show the street-facing elevation' },
        })
        expect(request.signal).toBeInstanceOf(AbortSignal)
        return { id: 'render_retained', status: 'pending' }
      },
      async (client) => {
        const result = await client.callTool({
          name: 'generate_studio_media',
          arguments: {
            pluginId: 'aedifex:architect',
            projectId: 'project_media_test',
            maxCredits: 20,
            modelId: 'available-model',
            prompt: 'Show the street-facing elevation',
            generationKey: 'render_elevation_01',
          },
        })
        expect(result.isError).not.toBe(true)
        expect(result.content).toEqual([
          { type: 'text', text: JSON.stringify({ id: 'render_retained', status: 'pending' }) },
        ])
      },
    )
  })

  test('returns an actionable admission refusal without exposing unexpected host failures', async () => {
    for (const [error, expected] of [
      [
        new AgentRefusal(
          'service_consent_required',
          'Reconnect and approve Aedifex service access.',
        ),
        { code: 'service_consent_required' },
      ],
      [
        Object.assign(new Error('Review the current price before trying again.'), {
          name: 'AgentRefusal',
          code: 'credit_limit_exceeded',
          details: { status: 409 },
        }),
        { code: 'credit_limit_exceeded', status: 409 },
      ],
      [new Error('private-provider-configuration'), { code: 'service_error' }],
    ] as const) {
      await withClient(
        async () => {
          throw error
        },
        async (client) => {
          const result = await client.callTool({
            name: 'list_pascal_services',
            arguments: { pluginId: 'aedifex:architect' },
          })
          expect(result.isError).toBe(true)
          const content = result.content as Array<{ type: 'text'; text: string }>
          expect(JSON.parse(content[0]!.text)).toMatchObject(expected)
          expect(JSON.stringify(result.content)).not.toContain('private-provider-configuration')
        },
      )
    }
  })

  test('a quote is text alone, and a submission names its key', async () => {
    const services = await serve((request) =>
      request.input.quoteToken
        ? { id: 'render_2', status: 'pending' }
        : { status: 'quote', quote: { credits: 8, quoteToken: 'v1.a.b' } },
    )
    try {
      const input = {
        modelId: 'nano-banana-2-1',
        prompt: 'The kitchen at dusk',
        generationKey: 'render_kitchen_01',
        sources: [{ type: 'view', id: `${'a'.repeat(64)}.webp` }],
      }
      const quoted = await services.call('generate_studio_media', input)
      expect(quoted).toHaveLength(1)
      expect(JSON.parse(quoted[0]!.text!)).toMatchObject({ status: 'quote' })
      await services.call('generate_studio_media', { ...input, quoteToken: 'v1.a.b' })
      expect(services.asked[1]).toMatchObject({
        action: 'studio.generate',
        input: { generationKey: 'render_kitchen_01', quoteToken: 'v1.a.b' },
      })
    } finally {
      await services.close()
    }
  })
})
