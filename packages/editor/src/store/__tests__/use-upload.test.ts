import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useUploadStore } from '../use-upload'

const LEVEL_A = 'level_aaa'
const LEVEL_B = 'level_bbb'

function getEntry(levelId: string) {
  const entry = useUploadStore.getState().uploads[levelId]
  if (!entry) throw new Error(`No upload entry for ${levelId}`)
  return entry
}

describe('useUploadStore', () => {
  beforeEach(() => {
    useUploadStore.setState({ uploads: {} })
  })

  afterEach(() => {
    useUploadStore.setState({ uploads: {} })
  })

  describe('initial state', () => {
    it('has no uploads', () => {
      const { uploads } = useUploadStore.getState()
      expect(uploads).toEqual({})
    })
  })

  describe('startUpload()', () => {
    it('creates an entry with preparing status', () => {
      useUploadStore.getState().startUpload(LEVEL_A, 'scan', 'floor-plan.e57')

      const entry = getEntry(LEVEL_A)
      expect(entry).toBeDefined()
      expect(entry.status).toBe('preparing')
    })

    it('creates entry with correct assetType and fileName', () => {
      useUploadStore.getState().startUpload(LEVEL_A, 'guide', 'guide-image.png')

      const entry = getEntry(LEVEL_A)
      expect(entry.assetType).toBe('guide')
      expect(entry.fileName).toBe('guide-image.png')
    })

    it('creates entry with progress 0', () => {
      useUploadStore.getState().startUpload(LEVEL_A, 'scan', 'scan.e57')

      const entry = getEntry(LEVEL_A)
      expect(entry.progress).toBe(0)
    })

    it('creates entry with null error and resultUrl', () => {
      useUploadStore.getState().startUpload(LEVEL_A, 'scan', 'scan.e57')

      const entry = getEntry(LEVEL_A)
      expect(entry.error).toBeNull()
      expect(entry.resultUrl).toBeNull()
    })

    it('overwrites an existing entry for the same levelId', () => {
      useUploadStore.getState().startUpload(LEVEL_A, 'scan', 'old.e57')
      useUploadStore.getState().setProgress(LEVEL_A, 50)
      useUploadStore.getState().startUpload(LEVEL_A, 'guide', 'new.png')

      const entry = getEntry(LEVEL_A)
      expect(entry.assetType).toBe('guide')
      expect(entry.progress).toBe(0)
      expect(entry.status).toBe('preparing')
    })
  })

  describe('setProgress()', () => {
    it('updates progress value', () => {
      useUploadStore.getState().startUpload(LEVEL_A, 'scan', 'scan.e57')
      useUploadStore.getState().setProgress(LEVEL_A, 42)

      const entry = getEntry(LEVEL_A)
      expect(entry.progress).toBe(42)
    })

    it('does not change other fields when updating progress', () => {
      useUploadStore.getState().startUpload(LEVEL_A, 'scan', 'scan.e57')
      useUploadStore.getState().setProgress(LEVEL_A, 75)

      const entry = getEntry(LEVEL_A)
      expect(entry.status).toBe('preparing')
      expect(entry.fileName).toBe('scan.e57')
    })

    it('is a no-op when levelId does not exist', () => {
      useUploadStore.getState().setProgress('level_nonexistent', 50)
      const { uploads } = useUploadStore.getState()
      expect(uploads['level_nonexistent']).toBeUndefined()
    })
  })

  describe('setStatus()', () => {
    it('updates status to uploading', () => {
      useUploadStore.getState().startUpload(LEVEL_A, 'scan', 'scan.e57')
      useUploadStore.getState().setStatus(LEVEL_A, 'uploading')

      expect(getEntry(LEVEL_A).status).toBe('uploading')
    })

    it('updates status to confirming', () => {
      useUploadStore.getState().startUpload(LEVEL_A, 'scan', 'scan.e57')
      useUploadStore.getState().setStatus(LEVEL_A, 'confirming')

      expect(getEntry(LEVEL_A).status).toBe('confirming')
    })

    it('updates status to done', () => {
      useUploadStore.getState().startUpload(LEVEL_A, 'scan', 'scan.e57')
      useUploadStore.getState().setStatus(LEVEL_A, 'done')

      expect(getEntry(LEVEL_A).status).toBe('done')
    })

    it('is a no-op when levelId does not exist', () => {
      useUploadStore.getState().setStatus('level_nonexistent', 'done')
      const { uploads } = useUploadStore.getState()
      expect(uploads['level_nonexistent']).toBeUndefined()
    })
  })

  describe('setError()', () => {
    it('sets error message', () => {
      useUploadStore.getState().startUpload(LEVEL_A, 'scan', 'scan.e57')
      useUploadStore.getState().setError(LEVEL_A, 'Network timeout')

      const entry = getEntry(LEVEL_A)
      expect(entry.error).toBe('Network timeout')
    })

    it('sets status to error when setError is called', () => {
      useUploadStore.getState().startUpload(LEVEL_A, 'scan', 'scan.e57')
      useUploadStore.getState().setStatus(LEVEL_A, 'uploading')
      useUploadStore.getState().setError(LEVEL_A, 'Upload failed')

      const entry = getEntry(LEVEL_A)
      expect(entry.status).toBe('error')
    })

    it('is a no-op when levelId does not exist', () => {
      useUploadStore.getState().setError('level_nonexistent', 'oops')
      expect(useUploadStore.getState().uploads['level_nonexistent']).toBeUndefined()
    })
  })

  describe('setResult()', () => {
    it('sets resultUrl', () => {
      useUploadStore.getState().startUpload(LEVEL_A, 'scan', 'scan.e57')
      useUploadStore.getState().setResult(LEVEL_A, 'https://cdn.example.com/scan.e57')

      const entry = getEntry(LEVEL_A)
      expect(entry.resultUrl).toBe('https://cdn.example.com/scan.e57')
    })

    it('sets status to done when setResult is called', () => {
      useUploadStore.getState().startUpload(LEVEL_A, 'scan', 'scan.e57')
      useUploadStore.getState().setResult(LEVEL_A, 'https://cdn.example.com/scan.e57')

      const entry = getEntry(LEVEL_A)
      expect(entry.status).toBe('done')
    })

    it('is a no-op when levelId does not exist', () => {
      useUploadStore.getState().setResult('level_nonexistent', 'https://example.com/file')
      expect(useUploadStore.getState().uploads['level_nonexistent']).toBeUndefined()
    })
  })

  describe('clearUpload()', () => {
    it('removes the entry for the given levelId', () => {
      useUploadStore.getState().startUpload(LEVEL_A, 'scan', 'scan.e57')
      useUploadStore.getState().clearUpload(LEVEL_A)

      expect(useUploadStore.getState().uploads[LEVEL_A]).toBeUndefined()
    })

    it('is a no-op when levelId does not exist', () => {
      useUploadStore.getState().startUpload(LEVEL_A, 'scan', 'scan.e57')
      useUploadStore.getState().clearUpload('level_nonexistent')

      // The existing entry should be untouched
      expect(useUploadStore.getState().uploads[LEVEL_A]).toBeDefined()
    })
  })

  describe('multiple concurrent uploads', () => {
    it('tracks two uploads independently', () => {
      useUploadStore.getState().startUpload(LEVEL_A, 'scan', 'scan-a.e57')
      useUploadStore.getState().startUpload(LEVEL_B, 'guide', 'guide-b.png')

      useUploadStore.getState().setProgress(LEVEL_A, 30)
      useUploadStore.getState().setProgress(LEVEL_B, 80)

      expect(getEntry(LEVEL_A).progress).toBe(30)
      expect(getEntry(LEVEL_B).progress).toBe(80)
    })

    it('setStatus on one level does not affect the other', () => {
      useUploadStore.getState().startUpload(LEVEL_A, 'scan', 'scan-a.e57')
      useUploadStore.getState().startUpload(LEVEL_B, 'guide', 'guide-b.png')
      useUploadStore.getState().setStatus(LEVEL_A, 'uploading')

      expect(getEntry(LEVEL_A).status).toBe('uploading')
      expect(getEntry(LEVEL_B).status).toBe('preparing')
    })

    it('clearUpload removes only the target level', () => {
      useUploadStore.getState().startUpload(LEVEL_A, 'scan', 'scan-a.e57')
      useUploadStore.getState().startUpload(LEVEL_B, 'guide', 'guide-b.png')
      useUploadStore.getState().clearUpload(LEVEL_A)

      const { uploads } = useUploadStore.getState()
      expect(uploads[LEVEL_A]).toBeUndefined()
      expect(uploads[LEVEL_B]).toBeDefined()
    })

    it('error on one level does not affect the other', () => {
      useUploadStore.getState().startUpload(LEVEL_A, 'scan', 'scan-a.e57')
      useUploadStore.getState().startUpload(LEVEL_B, 'guide', 'guide-b.png')
      useUploadStore.getState().setError(LEVEL_A, 'Server error')

      expect(getEntry(LEVEL_A).status).toBe('error')
      expect(getEntry(LEVEL_B).status).toBe('preparing')
    })
  })
})
