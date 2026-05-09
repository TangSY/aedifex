/**
 * Environment variable validation for the editor app.
 *
 * This file validates environment variables used by the standalone editor app.
 * Values are loaded from the repo root .env.local by package scripts.
 *
 * @see https://env.t3.gg/docs/nextjs
 */
import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const env = createEnv({
  /**
   * Server-side environment variables (not exposed to client)
   */
  server: {
    // AI Assistant
    AI_API_KEY: z.string().optional(),
  },

  /**
   * Client-side environment variables (exposed to browser via NEXT_PUBLIC_)
   */
  client: {
    NEXT_PUBLIC_ASSETS_CDN_URL: z.string().optional(),
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: z.string().optional(),
    NEXT_PUBLIC_APP_URL: z.string().optional(),
  },

  /**
   * Runtime values - pulls from process.env
   */
  runtimeEnv: {
    // Server
    AI_API_KEY: process.env.AI_API_KEY,
    // Client
    NEXT_PUBLIC_ASSETS_CDN_URL:
      process.env.NEXT_PUBLIC_ASSETS_CDN_URL ?? process.env.NEXT_PUBLIC_EDITOR_ASSETS_CDN_URL,
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },

  /**
   * Skip validation during build (env vars come from hosting platform at runtime)
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
})
