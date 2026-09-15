export function resolveRegisteredTreeNodeComponent<T>({
  nodeType,
  components,
  isRegistered,
  fallback,
}: {
  nodeType: string
  components: Readonly<Record<string, T>>
  isRegistered: (nodeType: string) => boolean
  fallback: T
}): T | undefined {
  return components[nodeType] ?? (isRegistered(nodeType) ? fallback : undefined)
}
