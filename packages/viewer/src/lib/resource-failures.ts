const failures = new Map<string, number>()
const listeners = new Set<() => void>()

export function getResourceFailureCount(): number {
  return failures.size
}

export function subscribeResourceFailures(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function retainResourceFailure(key: string): () => void {
  const count = failures.get(key) ?? 0
  failures.set(key, count + 1)
  if (count === 0) for (const listener of listeners) listener()
  let released = false
  return () => {
    if (released) return
    released = true
    const remaining = (failures.get(key) ?? 1) - 1
    if (remaining > 0) failures.set(key, remaining)
    else {
      failures.delete(key)
      for (const listener of listeners) listener()
    }
  }
}
