type BlurTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>

export function bindWindowBlurCancel(cancel: () => void, target: BlurTarget = window): () => void {
  const onBlur = () => cancel()
  target.addEventListener('blur', onBlur)
  return () => target.removeEventListener('blur', onBlur)
}
