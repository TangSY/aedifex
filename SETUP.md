# Aedifex - Setup Guide

This guide will help you set up the Aedifex editor for local development.

## Prerequisites

- Node.js 18+
- pnpm 10+ (`corepack enable && corepack prepare pnpm@latest --activate`)

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure Environment Variables

Create `apps/editor/.env.local`:

```bash
# AI Assistant (optional — powers the AI chat feature)
AI_API_KEY=<your_anthropic_api_key>

# Google Maps (optional — for address search)
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=<your_google_maps_key>
```

### 3. Start the Development Server

```bash
pnpm dev
```

The editor will be available at http://localhost:3002

## Monorepo Structure

```
.
├── apps/
│   └── editor/              # Next.js editor application
│       ├── app/             # Next.js app routes
│       └── components/      # UI components
├── packages/
│   ├── core/               # @aedifex/core - Core editor logic
│   ├── viewer/             # @aedifex/viewer - 3D viewer
│   ├── editor/             # @aedifex/editor - Editor components
│   └── ui/                 # @repo/ui - Shared UI components
└── turbo.json
```

## Scene Management

- **Save Build**: Export your scene as a JSON file for backup or sharing
- **Load Build**: Import a previously saved JSON file
- **Auto-Save**: The editor auto-saves to localStorage

## Development Workflow

### Running Tests

```bash
pnpm test
```

### Linting & Formatting

```bash
pnpm check     # Biome check
pnpm format    # Biome format
```

## Troubleshooting

### Editor not loading

Make sure all dependencies are installed:
```bash
pnpm install
```

### AI Chat not working

Verify that `AI_API_KEY` is set in `apps/editor/.env.local`.
