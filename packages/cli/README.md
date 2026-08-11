# Aedifex CLI

Run the open-source [Aedifex 3D building editor](https://github.com/TangSY/aedifex) locally
from your terminal—without cloning or building the Aedifex repository.

[![npm version](https://img.shields.io/npm/v/@aedifex/cli?label=npm)](https://www.npmjs.com/package/@aedifex/cli)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)

```bash
npx @aedifex/cli editor
```

On an interactive first run through `npx`, Aedifex installs the same CLI version globally
after the editor becomes healthy. The shorter `aedifex` command is therefore available
for `status`, `logs`, `stop`, and future sessions without another setup step. If the
global installation is unavailable because of local npm permissions, the editor remains
running and the CLI shows the equivalent `npx` commands plus the manual install command.

The first run walks through local storage, runtime installation, automatic editor and
MCP port selection, process startup, and both health checks with live terminal feedback.
It then opens `http://aedifex.localhost:<port>`. Your projects are stored separately from
the runtime, so updating the CLI does not replace your work.

## Why use the CLI?

- Run a complete local Aedifex editor with one command.
- Keep projects on your machine in a local SQLite database.
- Start and stop the editor independently from your terminal session.
- Inspect health, logs, versions, storage, and project state from scripts or agents.
- Connect Codex, Claude Code, Cursor, or another MCP client to the same local projects.
- Update through a health-checked activation that rolls back if the new runtime fails.

## Requirements

- Node.js 22.13 or newer
- npm, including when the CLI itself is launched with pnpm or Bun
- A browser, unless you pass `--no-open`

The initial supported release is macOS. The packed runtime also passes automated
release smoke tests on Ubuntu; broader Linux and Windows support is still being
verified.

## Install and run

Use your preferred package runner:

```bash
# npm
npx @aedifex/cli editor

# pnpm
pnpm dlx @aedifex/cli editor

# Bun
bunx @aedifex/cli editor
```

To install the `aedifex` command before starting the editor:

```bash
npm install --global @aedifex/cli
aedifex editor
```

After the interactive `npx` first run or a global installation, `aedifex status`,
`aedifex logs --follow`, and the other commands work directly in the current terminal
and future sessions.

Use `--no-open` on a headless machine. Use `--foreground` when a process supervisor
should own the editor or when you want logs attached to the current terminal.
Aedifex asks the operating system for an available loopback port by default, so it does
not compete with other local development servers. Pass `--port <n>` to request a
specific port; if it is occupied, Aedifex reports that and safely selects another one.

```bash
npx @aedifex/cli editor --no-open
npx @aedifex/cli editor --foreground --no-open
```

## Commands

| Command | Purpose |
| --- | --- |
| `aedifex editor` | Install if needed, ensure the editor is running, and open it. |
| `aedifex start` | Ensure the editor is running without opening a browser. |
| `aedifex stop [--force]` | Stop the managed editor and MCP processes; `--force` is a guarded recovery path. |
| `aedifex restart` | Restart the editor and MCP service with their current configuration. |
| `aedifex status [--json]` | Show editor and MCP health, version, PIDs, ports, URL, and runtime metadata. |
| `aedifex open [project]` | Start Aedifex if needed, then open the editor or a project by ID, ID prefix, or unique name. |
| `aedifex resume [project]` | Open the latest project, or a selected project. |
| `aedifex projects [--json]` | List local projects. |
| `aedifex logs [--follow]` | Read or follow the managed editor log. |
| `aedifex update [--version <version>]` | Health-check and activate a published runtime. |
| `aedifex doctor [--json]` | Diagnose Node.js, storage, runtime, process, and plugin state. |
| `aedifex info [--json]` | Print platform, paths, runtime, and plugin context. |
| `aedifex project list [--json]` | Explicit form of `aedifex projects`. |
| `aedifex project open <id-or-name>` | Explicit form of `aedifex open <project>`. |
| `aedifex mcp connect` | Stable local connector for MCP clients; discovers the dynamic managed service. |
| `aedifex mcp status [--json]` | Show managed MCP health. |
| `aedifex mcp config [--json]` | Print generic MCP client configuration. |
| `aedifex mcp setup <codex\|claude>` | Configure an installed client without overwriting existing entries. |
| `aedifex plugin list [--json]` | Inspect the reserved managed-plugin lock. |

When you do not install globally, prefix commands with a runner—for example,
`npx @aedifex/cli doctor`.

## Local data and security

Aedifex binds the editor and MCP service only to `127.0.0.1` and uses the reserved
`.localhost` hostname. MCP requires a random token stored in Aedifex's private runtime
directory; client configuration never contains that token.

```text
~/.pascal/
  runtime/<version>/           installed editor runtimes
  data/aedifex.db               projects and scenes
  logs/editor.log              detached editor output
  run/editor.json              managed editor and MCP process identity
  run/mcp-token                private local MCP token
  plugins/                     reserved verified-plugin storage
  aedifex.plugins.lock          reserved managed-plugin lock
```

The `~/.pascal/` root is intentionally retained for compatibility with existing
Aedifex editor and MCP data.

Runtime installation, project data, process state, and logs have separate lifecycles.
The CLI does not include a command that deletes project data. Updates retain the
previous runtime for rollback, and `aedifex doctor` warns when more than three versions
have accumulated.

## Local AI agents

The MCP server starts automatically with `aedifex editor`. Add the stable connector to
your client once:

```bash
aedifex mcp setup codex
aedifex mcp setup claude
```

Or use `aedifex mcp config` for JSON-based clients. The connector also starts Aedifex
when an agent connects while it is stopped. Ask the agent to read
`aedifex://agent-guide`, list or load a scene, edit it, and return the `editorUrl`.

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
