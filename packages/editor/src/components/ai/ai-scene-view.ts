import {
  emitter,
  type SnapshotCapturedEvent,
  type SnapshotCaptureFailedEvent,
  useScene,
} from '@aedifex/core'
import { photoCropSize, sceneViewPlan, type SceneViewInput } from '@aedifex/core/agent-operations'
import { refuse } from '@aedifex/core/agent-tools'
import { useViewer } from '@aedifex/viewer'
import { nanoid } from 'nanoid'
import { AI_INPUT_LIMITS, type ChatContentPart } from './contracts/chat-request'

async function imageUrl(blob: Blob): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(blob.type))
    refuse('view_unavailable', 'The scene renderer returned an unsupported image format.')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if ((bytes.length * 4) / 3 + 64 > AI_INPUT_LIMITS.MAX_IMAGE_CONTENT / 2)
    refuse('view_unavailable', 'The scene image is too large; request a smaller view.')
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  return `data:${blob.type};base64,${btoa(binary)}`
}

export function requestSceneView(input: {
  plan: ReturnType<typeof sceneViewPlan>
  signal?: AbortSignal
}): Promise<SnapshotCapturedEvent> {
  return new Promise((resolve, reject) => {
    const requestId = nanoid()
    let settled = false
    const finish = (error?: Error, captured?: SnapshotCapturedEvent) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      emitter.off('snapshot:captured', onCapture)
      emitter.off('snapshot:capture-failed', onFailure)
      input.signal?.removeEventListener('abort', onAbort)
      if (error) reject(error)
      else resolve(captured!)
    }
    const onCapture = (event: SnapshotCapturedEvent) => {
      if (event.requestId === requestId) finish(undefined, event)
    }
    const onFailure = (event: SnapshotCaptureFailedEvent) => {
      if (event.requestId === requestId) finish(new Error(event.error))
    }
    const onAbort = () => finish(new DOMException('Agent loop aborted', 'AbortError'))
    const timer = setTimeout(
      () => finish(new Error('The scene renderer did not return a view.')),
      45_000,
    )
    emitter.on('snapshot:captured', onCapture)
    emitter.on('snapshot:capture-failed', onFailure)
    input.signal?.addEventListener('abort', onAbort, { once: true })
    if (input.signal?.aborted) return onAbort()
    const { pose, size, interior } = input.plan
    try {
      emitter.emit('camera-controls:generate-thumbnail', {
        requestId,
        projectId: useViewer.getState().projectId ?? '',
        ephemeral: true,
        standardSize: size,
        ...(pose.projection === 'orthographic' ? { ortho: pose } : { perspective: pose }),
        ...(interior ? { interior } : {}),
      })
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

async function photoCrop(
  crop: NonNullable<ReturnType<typeof sceneViewPlan>['crop']>,
): Promise<Blob> {
  if (
    !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(crop.source) ||
    crop.source.length > AI_INPUT_LIMITS.MAX_IMAGE_CONTENT
  )
    refuse(
      'photo_crop_unavailable',
      'Attach the reference photo as a PNG, JPEG or WebP data URL to crop it.',
    )
  const bitmap = await createImageBitmap(await (await fetch(crop.source)).blob())
  try {
    const [left, top, right, bottom] = crop.region
    if (right > bitmap.width || bottom > bitmap.height)
      refuse('photo_region_invalid', 'The reference region extends outside the photo.')
    const size = photoCropSize(right - left, bottom - top)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d')
    if (!context) refuse('photo_crop_unavailable', 'This browser cannot crop the reference photo.')
    context.drawImage(bitmap, left, top, right - left, bottom - top, 0, 0, size.width, size.height)
    return await new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Reference crop failed.'))),
        'image/png',
      ),
    )
  } finally {
    bitmap.close()
  }
}

export async function viewAgentScene(input: {
  args: SceneViewInput
  signal?: AbortSignal
  assertCurrent: () => void
}): Promise<{ result: Record<string, unknown>; images: ChatContentPart[] }> {
  if (typeof document === 'undefined')
    refuse('view_unavailable', 'A scene view needs the open editor.')
  if (document.visibilityState === 'hidden')
    refuse('editor_tab_hidden', 'Bring the editor tab to the front to look at the scene.')
  const plan = sceneViewPlan(useScene.getState().nodes, input.args)
  const crop = plan.crop ? await photoCrop(plan.crop) : null
  input.assertCurrent()
  const captured = await requestSceneView({ plan, signal: input.signal })
  input.assertCurrent()
  const images: ChatContentPart[] = [
    {
      type: 'text',
      text: 'Scene view rendered from the requested pose. Compare this image with the reference; sizes and counts come from scene tools.',
    },
    { type: 'image_url', image_url: { url: await imageUrl(captured.blob), detail: 'high' } },
  ]
  if (crop)
    images.push(
      { type: 'text', text: 'Reference photo crop:' },
      { type: 'image_url', image_url: { url: await imageUrl(crop), detail: 'high' } },
    )
  input.assertCurrent()
  return {
    result: {
      pose: plan.pose,
      width: captured.width,
      height: captured.height,
      ...(plan.interior ? { interior: plan.interior } : {}),
    },
    images,
  }
}
