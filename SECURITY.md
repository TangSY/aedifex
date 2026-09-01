# Security policy

## Reporting a vulnerability

Please do not open a public issue, pull request, or discussion for a security problem.

Report it privately through GitHub:

- [GitHub private vulnerability reporting](https://github.com/TangSY/aedifex/security/advisories/new)

Include what you have: affected package or route, version or commit, reproduction steps, and the impact you believe it has. A proof of concept helps a lot; a rough description is still worth sending.

We aim to acknowledge a report within three working days and to keep you updated while we work on a fix. We will credit you in the advisory unless you would rather stay anonymous.

## Supported versions

Fixes land on `main` and ship in the next release of the affected package. The `@aedifex/*` packages are pre-1.0 and only the latest published version of each receives security fixes.

## Scope

In scope:

- The packages published from this repo — `@aedifex/core`, `@aedifex/viewer`, `@aedifex/editor`, `@aedifex/nodes`, `@aedifex/mcp`, `@aedifex/ifc-converter`, and `@aedifex/cli`
- The standalone editor app in `apps/editor`
- The scene save API and the MCP server surface, including anything that lets untrusted scene data reach a parser, a renderer, or a stored graph

Out of scope:

- Findings that require a user to run untrusted code in their own browser console
- Denial of service through a deliberately enormous local scene file
- Automated scanner output with no demonstrated impact

Hosted deployments are operated separately and are outside this repository's scope.
