import { type AnyNodeDefinition, registerNode } from '@aedifex/core'

export function registerHostingTestNode(definition: AnyNodeDefinition) {
  registerNode({
    ...definition,
    geometry: () => {
      throw new Error('Unit-test host geometry must not be rendered')
    },
  })
}
