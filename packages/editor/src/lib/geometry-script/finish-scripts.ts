import {
  type AnyNodeId,
  type CompiledGeometryScript,
  type FinishScriptHost,
  type FinishScriptInputs,
  type FinishScriptTarget,
  finishScriptWrites,
  GEOMETRY_SCRIPT_MIME_TYPES,
  type GeometryScriptParamValue,
  getArtifactStore,
  pauseSceneHistory,
  refreshFinishScripts,
  resumeSceneHistory,
  staleFinishScripts,
  useScene,
} from '@aedifex/core'
import { useViewer } from '@aedifex/viewer'
import { compileGeometryScriptInWorker } from './client'

/**
 * Runs a finish script (a room's floor, a wall's face) in the sandbox for what it finishes and
 * stores the GLB and the module text, answering the compile with the stored hashes
 * (`setRoomFloorScript` and `setWallFaceScript` take it with its `inputs`).
 */
export async function compileAndStoreFinishScript(
  input: FinishScriptTarget & {
    code: string
    params?: Record<string, GeometryScriptParamValue>
    inputs: FinishScriptInputs
    assertCurrent?: () => void
  },
): Promise<CompiledGeometryScript> {
  const store = getArtifactStore()
  const projectId = useViewer.getState().projectId
  const assertCurrent = () => {
    input.assertCurrent?.()
    if (
      useScene.getState().readOnly ||
      getArtifactStore() !== store ||
      useViewer.getState().projectId !== projectId
    )
      throw new Error('The project changed while its finish script was compiling')
  }
  assertCurrent()
  const { glb, ...compiled } = await compileGeometryScriptInWorker({
    code: input.code,
    params: input.params,
    inputs: input.inputs,
  })
  assertCurrent()
  const context = {
    nodeId: input.nodeId,
    metadata: { name: input.face ? 'Wall finish' : 'Floor finish', mount: compiled.mount },
  }
  const [sha256] = await Promise.all([
    store.put(compiled.sha256, glb, 'model/gltf-binary', context),
    store.put(
      compiled.script,
      new TextEncoder().encode(input.code),
      GEOMETRY_SCRIPT_MIME_TYPES.three,
      context,
    ),
  ])
  assertCurrent()
  return { ...compiled, sha256 }
}

/** The editor tab's host for finish scripts: the sandbox compile and the scene's artifact store. */
export const editorFinishScriptHost: FinishScriptHost = {
  readScript: (sha256) => getArtifactStore().text(sha256),
  build: compileAndStoreFinishScript,
}

/** The module text of a finish script, read back from the artifact store. */
export function finishScriptCode(sha256: string): Promise<string | null> {
  return getArtifactStore().text(sha256)
}

const SETTLE_MS = 150

/**
 * Keeps every finish script built for what it finishes: after a scene change settles, each script
 * whose room's floor the structure re-derived, or whose wall face changed, runs again in the
 * sandbox. The new build is written outside history, as the reconcile's derived writes are, and
 * only while its floor or face is still the one it was built for; undo brings back the room or
 * wall and the script built for it together.
 */
export function initFinishScriptRefresh(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let active = true
  let running = false
  let again = false

  const run = async () => {
    if (running) {
      again = true
      return
    }
    running = true
    try {
      const nodes = useScene.getState().nodes
      const store = getArtifactStore()
      const projectId = useViewer.getState().projectId
      const assertCurrent = () => {
        if (
          !active ||
          useScene.getState().readOnly ||
          getArtifactStore() !== store ||
          useViewer.getState().projectId !== projectId
        )
          throw new Error('The project changed while refreshing its finish scripts')
      }
      if (useScene.getState().readOnly || staleFinishScripts(nodes).length === 0) return
      const refresh = await refreshFinishScripts(nodes, {
        readScript: (hash) => store.text(hash),
        build: (input) => compileAndStoreFinishScript({ ...input, assertCurrent }),
      })
      if (
        !active ||
        useScene.getState().readOnly ||
        getArtifactStore() !== store ||
        useViewer.getState().projectId !== projectId
      )
        return
      for (const { nodeId, face, error } of refresh.failed)
        console.error(
          `[finish script] ${nodeId}${face ? ` face ${face}` : ''} could not be rebuilt: ${error}`,
        )
      const writes = finishScriptWrites(useScene.getState().nodes, refresh.rebuilt)
      if (writes.length === 0) return
      pauseSceneHistory(useScene)
      try {
        useScene
          .getState()
          .updateNodes(writes.map(({ id, data }) => ({ id: id as AnyNodeId, data })))
      } finally {
        resumeSceneHistory(useScene)
      }
    } finally {
      running = false
      if (active && again) {
        again = false
        schedule()
      }
    }
  }

  const schedule = () => {
    if (!active) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void run()
    }, SETTLE_MS)
  }

  const unsubscribe = useScene.subscribe((state, previous) => {
    if (state.nodes !== previous.nodes) schedule()
  })
  schedule()
  return () => {
    active = false
    unsubscribe()
    if (timer) clearTimeout(timer)
  }
}
