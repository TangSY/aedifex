# @aedifex/ifc-converter

Pure conversion logic for IFC → Aedifex scene graphs. Takes a `Uint8Array` of
IFC bytes, returns `{ nodes, rootNodeIds, stats }` shaped against
`@aedifex/core` schemas.

No DOM, no React. The UI lives in `apps/ifc-converter`.
