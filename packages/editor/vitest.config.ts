import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // Vitest 默认按文件隔离 mock 注册表；测试内部若需要跨用例清理 vi.fn 状态，
    // 请在测试文件内显式 afterEach(() => vi.clearAllMocks()).
  },
})
