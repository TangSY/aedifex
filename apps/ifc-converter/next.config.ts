import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  logging: {
    browserToTerminal: true,
  },
  transpilePackages: [
    'three',
    '@aedifex/core',
    '@aedifex/ifc-converter',
    '@aedifex/nodes',
    '@aedifex/viewer',
  ],
  turbopack: {
    resolveAlias: {
      react: './node_modules/react',
      three: './node_modules/three',
      '@react-three/fiber': './node_modules/@react-three/fiber',
      '@react-three/drei': './node_modules/@react-three/drei',
    },
  },
  // web-ifc ships a WASM module. Serving it from the same origin as the
  // app keeps `WebAssembly.instantiateStreaming` happy with strict CSP /
  // module-MIME-type checks. The standalone repo copied the file into
  // public/; we do the same before every dev/build
  // (see packages/ifc-converter/scripts/copy-web-ifc-wasm.mjs).
  webpack: (config) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true }
    return config
  },
}

export default nextConfig
