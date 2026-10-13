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
| `AEDIFEX_PUBLIC_URL` | No | The address people use to reach the editor. Read per request; set it when Aedifex is hosted outside localhost (agent links use it). |
| `AEDIFEX_ADMIN_PASSWORD` | On a network host | The one password that unlocks a self-hosted editor. See "Self-hosting". |
| `AEDIFEX_AUTH` | No | `proxy` lets a reverse proxy that already authenticates every request replace the password. |
| `AEDIFEX_SCENE_API_TOKEN` | No | Bearer token for agents and scripts calling `/api/scenes`. |
| `AEDIFEX_DATA_DIR` | No | Directory holding `pascal.db` and artifacts (default: `~/.pascal/data`). |

Local development and the official hosted editor work without any environment variables.

## Self-hosting

The Dockerfile stages the same portable runtime as the local CLI into a Node runtime image. Build it in CI or a dedicated build environment; this repository does not publish an official container image. Configure `AEDIFEX_ADMIN_PASSWORD` and `AEDIFEX_PUBLIC_URL` before starting the resulting image. The compose file keeps the published port bound to loopback by default.

Saved scenes live in the `aedifex-data` volume (`/data` in the container).

How it is protected, by `apps/editor/lib/self-host-auth.ts`:

- **One workspace behind one password.** `AEDIFEX_ADMIN_PASSWORD` gates every page and API
  behind `/login`. There is one account; everyone who signs in shares the scenes. Sessions
  are signed with a digest of the password, so changing it signs everyone out.
- **Agents use a bearer.** Set `AEDIFEX_SCENE_API_TOKEN` and send it as
  `Authorization: Bearer …` to `/api/scenes` and `/api/artifacts`; the settings page shows the
  endpoint under "Connect an agent".
- **Fail closed.** A host that is not loopback with no password set serves a setup page
  listing the variables and nothing else. `AEDIFEX_AUTH=proxy` opts out when a reverse proxy
  (basic auth, SSO) already authenticates every request.
- **Loopback development.** Development may run without a password. Production scene API access without a password or token also requires `AEDIFEX_SCENE_API_ALLOW_LOOPBACK_WITHOUT_TOKEN=1`; the loopback-bound CLI sets it explicitly. Network access needs a password or an authenticating proxy.

Nothing is fixed at build time: `AEDIFEX_PUBLIC_URL` and the port are read when a request
comes in, so one image serves any domain. `/api/health` answers without a session.

**Public embeds.** Nothing is public by default. The **Share** button in the editor's navbar
has a "Public link" switch: turning it on makes the project viewable, read-only, at
`/embed/<id>`, which needs no password and can be put in an `<iframe>` (the panel gives
the snippet). The page looks like the editor's Preview mode; `/embed/<id>?ui=0` (the
panel's "Hide controls" switch) shows only the 3D view, without the header, the toolbar
or the 3D/2D switcher. Turning the link off makes that URL a 404 again. Besides the embed page itself,
`/api/scenes/<id>/public` is the only unauthenticated read of scene data, and it answers
only for shared projects; the files a shared scene references are served to it as well.

## Local CLI

The CLI uses a repository-built runtime. See [the CLI guide](packages/cli/README.md) for staging and local startup.

## Monorepo Structure

```
├── apps/
│   └── editor/          # Next.js editor application
├── packages/
│   ├── core/            # @aedifex/core — Scene schema, state, systems
│   ├── viewer/          # @aedifex/viewer — 3D rendering
│   └── ui/              # Shared UI components
└── tooling/             # Shared build and configuration tooling
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
