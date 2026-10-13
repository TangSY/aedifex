import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function settingsHooks() {
  const source = ts.createSourceFile('settings-model.ts', readFileSync(new URL('./settings-model.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true)
  const hook = source.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'multiNodeHooks')
  if (!hook) throw new Error('Missing XR multi-edit hook adapter')
  const output = ts.transpileModule(`${hook.getText(source)}\nreturn multiNodeHooks;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return new Function(output)()
}

describe('XR multi-node reconcile context', () => {
  test('lets a reconcile hook read another sibling’s proposed multi-edit value', () => {
    const previous = { id: 'column_a', height: 2 }
    const next = { ...previous, height: 3 }
    const nodes = { column_a: next, column_b: { id: 'column_b', height: 4 } }
    let received: unknown
    const hooks = settingsHooks()({ reconcile: (_previous: unknown, _next: unknown, proposed: typeof nodes) => {
      received = proposed
      return [{ id: 'beam_shared', data: { height: Math.max(proposed.column_a.height, proposed.column_b.height) } }]
    } })
    expect(hooks.reconcile(previous, next, nodes)).toEqual([{ id: 'beam_shared', data: { height: 4 } }])
    expect(received).toBe(nodes)
  })

  test('keeps derive’s existing patch while forwarding the previous node', () => {
    const previous = { height: 2, width: 1 }
    const hooks = settingsHooks()({ derive: (next: typeof previous, _patch: unknown, old: typeof previous) => ({ width: old.width + next.height - old.height }) })
    expect(hooks.derive({ ...previous, height: 3 }, { height: 3 }, previous)).toEqual({ height: 3, width: 2 })
    expect(hooks.reconcile).toBeUndefined()
  })
})
