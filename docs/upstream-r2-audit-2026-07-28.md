# Upstream R2 replay audit — 2026-07-28

This audit records the completeness decisions for rebuilding Aedifex from
`upstream/main@ab76686b` after the `47313263..ab76686b` upstream range.

## Fork assets

The old fork tip `e177f4f9` contains 217 paths that are absent from the new
upstream base. The rebuilt branch restores 149 of them, including:

- the Aedifex AI runtime, API routes, host contracts, and focused tests;
- MCP storage, live-sync, security, templates, resources, prompts, and tools;
- the in-repo `@aedifex/plugin-trees` Nature plugin and its assets;
- roof and roof-segment paint-slot extensions;
- Aedifex logos and the Chinese README;
- interaction safeguards and screenshot integration.

The remaining 68 paths are intentionally not restored:

- 62 legacy test files are superseded by the current upstream test layout and
  the broader subsystem suites retained on this branch;
- `packages/editor/src/components/editor/compass-hud.tsx` and
  `compass-overlay.tsx` are superseded by the synchronized 2D/3D compass in
  `floorplan-panel.tsx`;
- `packages/editor/src/lib/floorplan/selection-tool.ts` is superseded by the
  current registry-driven hit-testing and selection implementation;
- `packages/viewer/src/components/viewer/walkthrough-controls.tsx` is
  superseded by the current first-person controller, collider, and walkthrough
  HUD implementation;
- `packages/editor/src/r3f.d.ts` is superseded by the viewer-owned type
  declarations;
- `DESIGN.md` is superseded by the current CSS and `wiki/architecture`
  documentation.

## Branding and compatibility

Active package names, public APIs, environment variables, binaries, repository
links, UI strings, generated-file names, internal diagnostics, and IFC
converter symbols use Aedifex naming.

The following Pascal identifiers remain intentionally unchanged because they
are persisted data, protocol compatibility, legal attribution, or historical
facts:

- `x-pascal-scene-token` and `x-pascal-mcp-token`;
- MCP server name `pascal-mcp`;
- `~/.pascal/` and XDG `pascal/data` storage directories;
- existing `pascal-*` localStorage keys and `pascal.scene-nodes` clipboard data;
- `pascal_material`, `pascalItemMaterialCapture`, `pascalId`,
  `pascalSwingLeaf`, and `pascalTextureCacheKey`;
- the MIT attribution to Pascal Group Inc.;
- historical upstream PR, issue, and changelog links;
- the MIT `npm:@pascal-app/lingo` package alias.

## Public-repository boundary

- Removed tracked `.claude/` configuration from the rebuilt public tree.
- `.env.example` contains placeholders and documented local defaults only.
- Ignored developer `.env.local` files remain outside Git and are not part of
  this branch.
- The branch contains no Aedifex SaaS subscription, payment, authentication,
  cloud-storage, or private-server implementation.
