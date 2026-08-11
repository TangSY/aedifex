# Aedifex Editor — Setup

## Prerequisites

- [Bun](https://bun.sh/) 1.3+ and Node.js 20.9+

## Quick Start

```bash
bun install
bun dev
```

The editor will be running at **http://localhost:3002**.

## Environment Variables (optional)

Copy `.env.example` to `.env` if you need:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Dev server port (default: 3002) |

Local development and the official hosted editor work without any environment variables.

## Docker

```bash
docker compose up -d
```

The editor will be running at **http://localhost:3000**. Saved scenes live in
the `aedifex-data` volume, so they survive `docker compose down`.

Keep the container port at 3000: the `/scenes` page fetches its own API through
a base URL that only `NEXT_PUBLIC_APP_URL` can override, and Next inlines that
value at build time, so remapping the port to something else makes the page
return 500.

## CLI-managed editor

Node.js 22.13 or newer can install a persistent local runtime, start it in the
background, and open it in the browser without a repository checkout:

```bash
npx @aedifex/cli editor
```

The command starts the editor and its authenticated local MCP service together. Configure
an agent to launch `aedifex mcp connect`; for example, run `aedifex mcp setup codex`.

Use `npx @aedifex/cli doctor` to check the runtime, storage, editor, and MCP state. Saved
scenes live in `~/.pascal/data/aedifex.db` independently from installed runtime versions.
The CLI retains old runtime versions for rollback and warns after more than three have
accumulated. It also replaces a damaged copy of its bundled runtime on the next start;
neither operation modifies the data directory.
The complete command and storage reference is in
[`packages/cli/README.md`](./packages/cli/README.md).

## Monorepo Structure

```
├── apps/
│   └── editor/          # Next.js editor application
├── packages/
│   ├── core/            # @aedifex/core — Scene schema, state, systems
│   ├── viewer/          # @aedifex/viewer — 3D rendering
│   └── ui/              # Shared UI components
└── tooling/             # Build & release tooling
```

## Scripts

| Command | Description |
|---------|-------------|
| `bun dev` | Start the development server |
| `bun build` | Build all packages |
| `bun check` | Lint and format check (Biome) |
| `bun check:fix` | Auto-fix lint and format issues |
| `bun check-types` | TypeScript type checking |
| `bun run test` | Run every package's test suite |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on submitting PRs and reporting issues.
