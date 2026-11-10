import type { AnyNode, AnyNodeId } from '../schema/types'

type ParentNode = Pick<AnyNode, 'parentId'>
type NodeSource = Readonly<Record<string, ParentNode>> | ((id: AnyNodeId) => ParentNode | undefined)

export function wouldCreateHierarchyCycle({
  nodeId,
  parentId,
  nodes,
}: {
  nodeId: AnyNodeId
  parentId: AnyNodeId | null
  nodes: NodeSource
}): boolean {
  const seen = new Set<string>()
  let current: AnyNodeId | null = parentId
  while (current && !seen.has(current)) {
    if (current === nodeId) return true
    seen.add(current)
    const node = typeof nodes === 'function' ? nodes(current) : nodes[current]
    current = (node?.parentId as AnyNodeId | null | undefined) ?? null
  }
  return false
}

export function hierarchyCycleErrors(nodes: Readonly<Record<string, ParentNode>>) {
  const visited = new Set<string>()
  const errors: { nodeId: string; path: 'parentId'; message: string }[] = []
  for (const id of Object.keys(nodes)) {
    const chain: string[] = []
    const positions = new Map<string, number>()
    let current: string | null | undefined = id
    while (current && nodes[current] && !visited.has(current)) {
      const start = positions.get(current)
      if (start !== undefined) {
        const cycle = chain.slice(start)
        const message = `hierarchy cycle detected: ${[...cycle, cycle[0]].join(' -> ')}`
        for (const nodeId of cycle) errors.push({ nodeId, path: 'parentId', message })
        break
      }
      positions.set(current, chain.length)
      chain.push(current)
      current = nodes[current]?.parentId
    }
    for (const nodeId of chain) visited.add(nodeId)
  }
  return errors
}
