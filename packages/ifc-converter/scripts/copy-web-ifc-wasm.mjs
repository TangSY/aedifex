#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

function findWebIfcDir(startDir) {
  let dir = startDir
  while (dir && dir !== '/') {
    const candidate = join(dir, 'node_modules', 'web-ifc')
    if (existsSync(join(candidate, 'web-ifc.wasm'))) return candidate
    dir = resolve(dir, '..')
  }
  return null
}

const outputDir = process.argv[2]
if (!outputDir) {
  throw new Error('Usage: copy-web-ifc-wasm.mjs <public-directory>')
}

const webIfcDir = findWebIfcDir(import.meta.dirname)
if (!webIfcDir) {
  throw new Error('web-ifc package not found; cannot publish the IFC parser WASM assets')
}

const publicDir = resolve(process.cwd(), outputDir)
mkdirSync(publicDir, { recursive: true })

// Browsers select the multi-thread build only when cross-origin isolation is
// enabled. web-ifc-node.wasm is not used by browser conversion and must not be
// copied into public assets.
const files = ['web-ifc.wasm', 'web-ifc-mt.wasm']
for (const name of files) {
  const src = join(webIfcDir, name)
  const dst = join(publicDir, name)
  const srcSize = statSync(src).size

  copyFileSync(src, dst)
  console.log(`[ifc-converter] copied ${name} (${(srcSize / 1024).toFixed(0)} KB)`)
}
