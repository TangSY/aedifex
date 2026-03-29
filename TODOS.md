# TODOS

## AI Feature (Phase 1)

### [RESOLVED] 部署前确认 serverless 超时限制
- **What:** 确认托管环境的 serverless 函数执行时间限制，必要时切换到 Edge Runtime
- **Resolution:** 确认使用自托管 Docker 部署（OneDev CI/CD），无 serverless 超时限制。不再适用。
- **Resolved:** 2026-03-29 via /plan-eng-review (确认自托管 Docker 部署)

---

## Viewer & Core Improvements

### [RESOLVED] captureScreenshot() 迁移到 @aedifex/viewer
- **What:** 将 captureScreenshot() 从 packages/editor 移到 packages/viewer 并导出
- **Resolution:** 已迁移到 `packages/viewer/src/lib/capture-screenshot.ts`。新增 `setScreenshotRenderer()`/`clearScreenshotRenderer()` API 和 `excludeLayers` 参数。editor 通过 re-export 保持兼容。
- **Resolved:** 2026-03-29

### [RESOLVED] scene_data schemaVersion + 迁移策略
- **What:** scene_data 顶层加 schemaVersion 字段，实现读取时版本检查和自动迁移
- **Resolution:** 已在 `packages/core/src/store/use-scene.ts` 实现完整迁移框架。`CURRENT_SCHEMA_VERSION=1`，`SCHEMA_MIGRATIONS` Map 注册迁移函数，`parseSceneData()` 统一入口兼容旧数据，`serializeSceneData()` 输出版本化格式。新增类型 `VersionedSceneData`，全部从 `@aedifex/core` 导出。
- **Resolved:** 2026-03-29
