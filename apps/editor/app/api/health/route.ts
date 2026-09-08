export function GET() {
  return Response.json({
    status: 'ok',
    app: 'editor',
    version: process.env.AEDIFEX_RUNTIME_VERSION ?? null,
    instanceId: process.env.AEDIFEX_INSTANCE_ID ?? null,
    timestamp: new Date().toISOString(),
  })
}
