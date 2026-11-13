import { expect, test } from 'bun:test'
import { AUTHOR_SCENE_FILE_MAX_BYTES, resolveAuthorSceneInput } from './author-scene-input'

const valid = { levels: [{ name: 'Ground' }] }

test('the inline payload remains usable without a project file reader', async () => {
  const result = await resolveAuthorSceneInput({ payload: valid })
  expect(result.levels[0]?.name).toBe('Ground')
})

test('a file is read within the active project and validated like an inline payload', async () => {
  const calls: unknown[] = []
  const result = await resolveAuthorSceneInput({
    payloadFile: 'asset_a',
    projectId: 'project_a',
    readFile: async (request) => {
      calls.push(request)
      return new TextEncoder().encode(JSON.stringify(valid))
    },
  })
  expect(result.levels[0]).toMatchObject({ name: 'Ground', rooms: [], lights: [] })
  expect(calls).toMatchObject([
    { projectId: 'project_a', fileId: 'asset_a', maxBytes: AUTHOR_SCENE_FILE_MAX_BYTES },
  ])
})

test('missing, duplicate, invalid and oversized inputs are refused before conversion', async () => {
  await expect(resolveAuthorSceneInput({})).rejects.toMatchObject({ code: 'payload_required' })
  await expect(
    resolveAuthorSceneInput({ payload: valid, payloadFile: 'asset_a' }),
  ).rejects.toMatchObject({ code: 'payload_twice' })
  await expect(resolveAuthorSceneInput({ payloadFile: 'asset_a' })).rejects.toMatchObject({
    code: 'files_unavailable',
  })
  await expect(
    resolveAuthorSceneInput({
      payloadFile: 'asset_a',
      readFile: async () => new TextEncoder().encode('{'),
    }),
  ).rejects.toMatchObject({ code: 'payload_invalid' })
  await expect(
    resolveAuthorSceneInput({
      payloadFile: 'asset_a',
      readFile: async () => new TextEncoder().encode('{"levels":[]}'),
    }),
  ).rejects.toMatchObject({ code: 'payload_invalid' })
  await expect(
    resolveAuthorSceneInput({
      payloadFile: 'asset_a',
      readFile: async () => new Uint8Array(AUTHOR_SCENE_FILE_MAX_BYTES + 1),
    }),
  ).rejects.toMatchObject({ code: 'payload_too_large' })
})

test('an aborted request does not read a project file', async () => {
  const controller = new AbortController()
  controller.abort()
  let read = false
  await expect(
    resolveAuthorSceneInput({
      payloadFile: 'asset_a',
      signal: controller.signal,
      readFile: async () => {
        read = true
        return new Uint8Array()
      },
    }),
  ).rejects.toThrow()
  expect(read).toBe(false)
})

test('a file returned after cancellation is not accepted', async () => {
  const controller = new AbortController()
  await expect(
    resolveAuthorSceneInput({
      payloadFile: 'asset_a',
      signal: controller.signal,
      readFile: async () => {
        controller.abort()
        return new TextEncoder().encode(JSON.stringify(valid))
      },
    }),
  ).rejects.toThrow()
})
