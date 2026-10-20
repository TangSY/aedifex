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
    root: path.resolve(appDirectory, '../..'),
    resolveAlias: {
      '@aedifex/core': './../../node_modules/@aedifex/core',
      '@aedifex/editor': './../../node_modules/@aedifex/editor',
      '@aedifex/viewer': './../../node_modules/@aedifex/viewer',
      '@aedifex/nodes': './../../node_modules/@aedifex/nodes',
      react: './../../node_modules/react',
      'react-dom': './../../node_modules/react-dom',
      three: './../../node_modules/three',
      '@react-three/fiber': './../../node_modules/@react-three/fiber',
      '@react-three/drei': './../../node_modules/@react-three/drei',
      '@react-three/xr': './../../node_modules/@react-three/xr',
      zustand: './../../node_modules/zustand',
      zod: './../../node_modules/zod',
      iwer: './../../node_modules/iwer',
      '@iwer/devui': './../../node_modules/@iwer/devui',
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
