# @aedifex/nodes

Built-in node definitions for the Aedifex viewer and editor.

## Installation

```bash
npm install @aedifex/core @aedifex/viewer @aedifex/editor @aedifex/nodes
```

The package declares the remaining React, Next.js, Three.js, and UI libraries it needs as peer
dependencies. Install any peers reported by your package manager.

## Usage

Load `builtinPlugin` once before mounting a Aedifex viewer or editor:

```typescript
import { loadPlugin } from '@aedifex/core'
import { builtinPlugin } from '@aedifex/nodes'

await loadPlugin(builtinPlugin)
```

The plugin registers the built-in schemas, renderers, geometry builders, tools, and systems. Hosts
can load additional plugins through the same `loadPlugin` API.

See the
[`@aedifex/viewer` quick start](https://github.com/TangSY/aedifex/tree/main/packages/viewer#usage)
for bootstrap ordering in a React application.

## License

MIT
