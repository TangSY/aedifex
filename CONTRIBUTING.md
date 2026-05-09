# Contributing to Aedifex

Thanks for your interest in contributing! We welcome all kinds of contributions — bug fixes, new features, documentation, and ideas.

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 10+

### Setup

```bash
git clone https://github.com/AedifexOrg/aedifex.git
cd aedifex
pnpm install
pnpm dev
```

The editor will be running at **http://localhost:3002**. That's it!

### Optional

Copy `.env.example` to `.env` and add a Google Maps API key if you want address search functionality. The editor works fully without it.

## Making changes

### Code style

We use [Biome](https://biomejs.dev/) for linting and formatting. Before submitting a PR:

```bash
pnpm check        # Check for issues
pnpm check:fix    # Auto-fix issues
```

### Project structure

| Package | What it does |
|---------|-------------|
| `packages/core` | Scene schema, state management, systems — no UI |
| `packages/viewer` | 3D rendering with React Three Fiber |
| `packages/editor` | Editor tools, panels, AI assistant |
| `apps/editor` | The full editor app (Next.js) |

A key rule: **`packages/viewer` must never import from `apps/editor`** or `packages/editor`. The viewer is a standalone component; editor-specific behavior is injected via props/children.

## Submitting a PR

1. **Fork the repo** and create a branch from `main`
2. **Make your changes** and test locally with `pnpm dev`
3. **Run `pnpm check`** to make sure linting passes
4. **Open a PR** with a clear description of what changed and why
5. **Link related issues** if applicable (e.g., "Fixes #42")

### PR tips

- Keep PRs focused — one feature or fix per PR
- Include screenshots or recordings for visual changes
- If you're unsure about an approach, open an issue or discussion first

## Reporting bugs

Use the [Bug Report](https://github.com/AedifexOrg/aedifex/issues/new?template=bug_report.yml) template. Include steps to reproduce — this helps us fix things faster.

## Suggesting features

Use the [Feature Request](https://github.com/AedifexOrg/aedifex/issues/new?template=feature_request.yml) template, or start a [Discussion](https://github.com/AedifexOrg/aedifex/discussions) if you want to brainstorm first.

## Questions?

Head to [Discussions](https://github.com/AedifexOrg/aedifex/discussions) — we're happy to help!
