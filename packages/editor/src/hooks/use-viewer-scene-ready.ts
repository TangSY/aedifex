import { useEffect, useState } from 'react'

const SCENE_READY_FALLBACK_MS = 8000

type ViewerSceneReadiness = {
  isSceneDataLoading: boolean
  isViewerSceneReady: boolean
  sceneReadyKey: number
}

export function useViewerSceneReady({
  isSceneDataLoading,
  isViewerSceneReady,
  sceneReadyKey,
}: ViewerSceneReadiness): boolean {
  const [timedOutSceneKey, setTimedOutSceneKey] = useState<number | null>(null)
  // A renderer that mounts after the deadline can still report that it is waiting for its first frame.
  const viewerReady = isViewerSceneReady || timedOutSceneKey === sceneReadyKey

  useEffect(() => {
    if (isSceneDataLoading || viewerReady) return

    const timer = setTimeout(() => {
      console.warn('[editor] viewer scene readiness timed out; showing editor shell anyway', {
        sceneReadyKey,
      })
      setTimedOutSceneKey(sceneReadyKey)
    }, SCENE_READY_FALLBACK_MS)

    return () => clearTimeout(timer)
  }, [isSceneDataLoading, sceneReadyKey, viewerReady])

  return !isSceneDataLoading && viewerReady
}
