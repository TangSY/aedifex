import { type AuthorScenePayload, authorScenePayload } from '../agent-tools/author-scene'
import { refuse } from '../agent-tools/refusal'

export const AUTHOR_SCENE_FILE_MAX_BYTES = 32 * 1024 * 1024

export type ProjectFileReader = (request: {
  projectId?: string
  fileId: string
  maxBytes: number
  signal?: AbortSignal
}) => Promise<Uint8Array>

export async function resolveAuthorSceneInput({
  payload,
  payloadFile,
  projectId,
  readFile,
  signal,
}: {
  payload?: unknown
  payloadFile?: string
  projectId?: string
  readFile?: ProjectFileReader
  signal?: AbortSignal
}): Promise<AuthorScenePayload> {
  if (payload !== undefined && payloadFile !== undefined)
    refuse('payload_twice', 'Provide either payload or payloadFile, not both.')
  if (payload === undefined && payloadFile === undefined)
    refuse('payload_required', 'Provide a payload or an uploaded project file ID.')
  signal?.throwIfAborted()
  let source = payload
  if (payloadFile !== undefined) {
    if (!readFile) refuse('files_unavailable', 'This host cannot read project files; pass payload.')
    const bytes = await readFile({
      projectId,
      fileId: payloadFile,
      maxBytes: AUTHOR_SCENE_FILE_MAX_BYTES,
      signal,
    })
    signal?.throwIfAborted()
    if (bytes.byteLength > AUTHOR_SCENE_FILE_MAX_BYTES)
      refuse('payload_too_large', 'The project payload file exceeds the 32 MiB limit.')
    try {
      source = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    } catch {
      refuse('payload_invalid', 'The project payload file must contain UTF-8 JSON.')
    }
  }
  const parsed = authorScenePayload.safeParse(source)
  if (!parsed.success)
    refuse('payload_invalid', 'The payload does not match the author_scene schema.', {
      issues: parsed.error.issues.slice(0, 40).map(({ path, message }) => ({ path, message })),
    })
  return parsed.data
}
