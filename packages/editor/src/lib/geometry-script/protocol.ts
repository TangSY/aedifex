import type { GeometryScriptParamValue } from '@aedifex/core'
import type { GeometryScriptCompileOutput } from '@aedifex/geometry-script'

export type GeometryScriptWorkerRequest = {
  id: number
  code: string
  params?: Record<string, GeometryScriptParamValue>
}

export type GeometryScriptWorkerResponse =
  | { id: number; ok: true; output: GeometryScriptCompileOutput }
  | { id: number; ok: false; error: string }
