import { ALLOWED_ORIGINS_ENV, publicAssetOrigins } from '@aedifex/core'

export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json(
    { origins: publicAssetOrigins(process.env[ALLOWED_ORIGINS_ENV]) },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
