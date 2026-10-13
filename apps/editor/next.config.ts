import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const appDirectory = path.dirname(fileURLToPath(import.meta.url))
const portableBuild = process.env.AEDIFEX_PORTABLE_BUILD === '1'

const nextConfig: NextConfig = {
  ...(portableBuild
    ? { output: 'standalone' as const, outputFileTracingRoot: path.join(appDirectory, '../..') }
    : {}),
  logging: {
    browserToTerminal: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async headers() {
    return [
      {
        source: '/embed/:path*',
        headers: [{ key: 'Content-Security-Policy', value: 'frame-ancestors *' }],
      },
    ]
  },
  // MCP / package metadata returns `/editor/<id>` (hosted route). This open-source
  // app serves saved projects at `/project/<id>` — redirect so links and bookmarks work.
  async redirects() {
    return [
      {
        source: '/editor/:id',
        destination: '/project/:id',
        permanent: false,
      },
      // Former routes: the list moved to the home page, scenes became projects.
      { source: '/scenes', destination: '/', permanent: false },
      { source: '/scene/:id', destination: '/project/:id', permanent: false },
    ]
  },
  transpilePackages: [
    'three',
    '@aedifex/viewer',
    '@aedifex/core',
    '@aedifex/editor',
    '@aedifex/mcp',
    '@aedifex/plugin-trees',
    '@aedifex/plugin-webxr',
    '@dgreenheck/ez-tree',
  ],
  turbopack: {
    resolveAlias: {
      react: './node_modules/react',
      three: './node_modules/three',
      '@react-three/fiber': './node_modules/@react-three/fiber',
      '@react-three/drei': './node_modules/@react-three/drei',
    },
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
  images: {
    unoptimized:
      portableBuild ||
      (process.env.NEXT_PUBLIC_ASSETS_CDN_URL?.startsWith('http://localhost') ?? false),
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
}

export default nextConfig
