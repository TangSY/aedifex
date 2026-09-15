# Aedifex CLI

Repository-local CLI and packed-runtime test harness for the
[Aedifex 3D building editor](https://github.com/TangSY/aedifex).

[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)

This package is private and is not published to npm. Normal development uses `bun dev`
from the repository root. The CLI remains available for local packed-runtime and MCP
integration testing.

The first run walks through local storage, runtime installation, automatic editor and
MCP port selection, process startup, and both health checks with live terminal feedback.
It then opens `http://aedifex.localhost:<port>`. Projects are stored separately from
the runtime, so rebuilding the CLI does not replace your work.

## Why use the CLI?

- Run a complete local Aedifex editor with one command.
- Keep projects on your machine in a local SQLite database.
- Start and stop the editor independently from your terminal session.
- Inspect health, logs, versions, storage, and project state from scripts or agents.
- Connect Codex, Claude Code, Cursor, or another MCP client to the same local projects.
- Exercise health-checked runtime activation and rollback in local integration tests.

## Requirements

- Node.js 22.13 or newer
- Bun 1.3+
- A browser, unless you pass `--no-open`
- A locally built and staged runtime for the web editor; MCP-only use needs the staged MCP service.

The local packed runtime is primarily tested on macOS. Broader Linux and Windows
support is still being verified.

Use one active agent client per local CLI service. Its active scene state is shared;
use separate `AEDIFEX_HOME` directories and service processes for independent work.

## Build and run from the repository

Build the editor runtime and CLI, stage the runtime, then link the local command:

```bash
cd packages/cli
bun run build-runtime
bun run build
bun run stage-runtime
bun link
aedifex editor
```

`bun link` links the current checkout; it does not publish or download an npm package.

Use `--no-open` on a headless machine. Use `--foreground` when a process supervisor
should own the editor or when you want logs attached to the current terminal.
Aedifex asks the operating system for an available loopback port by default, so it does
not compete with other local development servers. Pass `--port <n>` to request a
specific port; if it is occupied, Aedifex reports that and safely selects another one.

```bash
aedifex editor --no-open
aedifex editor --foreground --no-open
```

## The web editor runtime

`bun run stage-runtime` stages the locally built Next.js server and assets in
`packages/cli/dist/runtime`, and bundles MCP separately in
`packages/cli/dist/services/aedifex-mcp.mjs`.

When the editor starts, the CLI reuses the active local runtime or installs the staged
bundle into `~/.pascal/runtime/<version>`. Use `--runtime <directory>` to select a local
build explicitly, or set `AEDIFEX_BUNDLED_RUNTIME_DIR` to override the default bundle.
No npm release channel, hosted account login, runtime archive, or remote download is used.
Concurrent installs share the runtime lock.

Existing v1 runtime manifests remain readable; new staging emits v2. On first use,
the previous MCP process is verified and retired before the independent managed MCP
service starts. Project storage is preserved. An unverified process blocks migration.

`aedifex mcp connect` starts the locally bundled service without installing or starting
the web editor.

## Commands

| Command | Purpose |
| --- | --- |
| `aedifex editor [--runtime <directory>]` | Install a local runtime if needed, start the editor, and open it. |
| `aedifex start [--runtime <directory>]` | Start the editor without opening a browser. |
| `aedifex stop [--force]` | Stop managed editor and MCP processes; force remains identity-checked. |
| `aedifex restart` | Restart the editor and repoint MCP to its local URL. |
| `aedifex status [--json]` | Show editor and MCP health and process metadata. |
| `aedifex open [project]` | Open the editor or a project by ID, ID prefix, or unique name. |
| `aedifex resume [project]` | Open the latest project, or a selected project. |
| `aedifex projects [--json]` | List local projects. |
| `aedifex logs [--follow]` | Read or follow the managed editor log. |
| `aedifex update [--runtime <directory>]` | Health-check and activate the local runtime with rollback on failure. |
| `aedifex doctor [--json]` | Diagnose Node.js, storage, runtime, process, and plugin state. |
| `aedifex info [--json]` | Print platform, paths, runtime, and plugin context. |
| `aedifex project list [--json]` | Explicit form of `aedifex projects`. |
| `aedifex project open <id-or-name>` | Explicit form of `aedifex open <project>`. |
| `aedifex mcp connect` | Start or reuse the independent local MCP service. |
| `aedifex mcp status [--json]` | Show managed MCP health. |
| `aedifex mcp config [--json]` | Print generic MCP client configuration. |
| `aedifex mcp setup <codex\|claude>` | Configure an installed client without overwriting existing entries. |
| `aedifex plugin list [--json]` | Inspect the reserved managed-plugin lock. |

## Local data and security

Aedifex binds the editor and MCP service only to `127.0.0.1` and uses the reserved
`.localhost` hostname. MCP requires a random token stored in Aedifex's private runtime
directory; client configuration never contains that token.

```text
~/.pascal/
  runtime/<version>/           installed local editor runtimes
  data/aedifex.db              projects and scenes
  logs/editor.log              detached editor and MCP output
  run/editor.json              managed editor process identity
  run/mcp.json                 managed MCP service identity
  run/mcp-token                private local MCP token
  tmp/                         reserved temporary storage
  plugins/                     reserved verified-plugin storage
  aedifex.plugins.lock          reserved managed-plugin lock
```

The `~/.pascal/` root is intentionally retained for compatibility with existing
Aedifex editor and MCP data.

Runtime installation, project data, process state, and logs have separate lifecycles.
The CLI does not include a command that deletes project data. Local runtime activations
retain the previous runtime for rollback, and `aedifex doctor` warns when more than three
versions have accumulated.

## Local AI agents

The MCP server starts automatically with `aedifex editor`. It also starts independently
when a client runs `aedifex mcp connect`. Add the stable connector to your client once:

```bash
aedifex mcp setup codex
aedifex mcp setup claude
```

Or use `aedifex mcp config` for JSON-based clients. Ask the agent to read
`aedifex://agent-guide`, list or load a scene, edit it, and return the `editorUrl`.
Run `aedifex editor` to open those local project URLs.

## Plugins

The current CLI manages the local editor runtime; it does not yet download plugin code
from GitHub or npm. Follow the [plugin authoring guide](../../wiki/architecture/plugin-authoring.md)
and the in-repository [Nature plugin](../plugin-trees) when building an extension.
For agent integration, use the standalone `@aedifex/mcp` package.

## Documentation and support

- [Setup guide](../../SETUP.md)
- [Plugin authoring guide](../../wiki/architecture/plugin-authoring.md)
- [MCP and AI-agent guide](../mcp/README.md)
- [Open-source repository](https://github.com/TangSY/aedifex)
- [Issues and feature requests](https://github.com/TangSY/aedifex/issues)

## License

MIT
