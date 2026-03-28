# TODOS

## AI Feature (Phase 1)

### [TODO] 部署前确认 serverless 超时限制
- **What:** 确认托管环境的 serverless 函数执行时间限制，必要时切换到 Edge Runtime
- **Why:** AI streaming 响应可能需要 15-60s，Vercel 默认 serverless 超时 10-60s（取决于 plan），可能不够
- **Pros:** 避免生产环境 AI 请求被截断
- **Cons:** Edge Runtime 有 API 限制（无 Node.js fs 等），需要验证兼容性
- **Context:** Next.js 16 App Router 的 API Route 默认运行在 Node.js serverless 环境。Claude API streaming 响应可能持续 15-60s。如果部署到 Vercel Free/Hobby plan（10s 超时），需要切换到 Edge Runtime 或升级 plan。如果自托管则无此限制。部署前检查 `route.ts` 的 `export const runtime = 'edge'` 是否需要。
- **Depends on:** 确定部署环境
- **Added:** 2026-03-26 via /plan-eng-review (Outside Voice finding #6)
