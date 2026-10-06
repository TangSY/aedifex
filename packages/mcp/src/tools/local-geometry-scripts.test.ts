import { expect, spyOn, test } from 'bun:test'
import * as childProcess from 'node:child_process'
import { localGeometryScripts } from './local-geometry-scripts'

test('local script compilation defaults to disabled and never spawns without explicit opt-in', async () => {
  const previous = process.env.AEDIFEX_SERVER_SCRIPT_COMPILE
  const spawn = spyOn(childProcess, 'spawn').mockImplementation(() => {
    throw Error('Disabled compilation must never spawn.')
  })
  try {
    const host = localGeometryScripts('.git/disabled-geometry-test.db')
    for (const flag of [undefined, '', '0', 'true']) {
      if (flag === undefined) delete process.env.AEDIFEX_SERVER_SCRIPT_COMPILE
      else process.env.AEDIFEX_SERVER_SCRIPT_COMPILE = flag
      await expect(host.compile({ code: 'export default function build() {}' })).rejects.toThrow(
        'requires AEDIFEX_SERVER_SCRIPT_COMPILE=1',
      )
    }
    expect(spawn).not.toHaveBeenCalled()
  } finally {
    spawn.mockRestore()
    if (previous === undefined) delete process.env.AEDIFEX_SERVER_SCRIPT_COMPILE
    else process.env.AEDIFEX_SERVER_SCRIPT_COMPILE = previous
  }
})
