# Changelog

All notable changes to `@walkcloud/synthetix-mcp` are documented here.
该仓库的所有重要变更记录于此。

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.1.0] — 2026-07-23

### New workflow prompts · 新增工作流 prompt

Three new prompts bring the total to 6 predefined workflows (surfaced as slash commands in clients like Claude Code) · 新增 3 个 prompt,工作流总数达 6 个:

- **`/knowledge-deep-dive`** — Structured deep-read of an uploaded document (retrieve key points, distill a summary). EN: deep-read research/learning. CN: 知识深读,适合研读/学习。
- **`/proposal-from-scratch`** — Archetype-based fast long-form generation (technical solution / proposal / bidding / consulting / etc.), skips heavy brainstorm and goes straight to structured generation + batch write. CN: 方案速成,基于原型从零高效成稿。
- **`/export-readiness-check`** — Verify all draft sections are confirmed before export; lists any unconfirmed sections. CN: 导出就绪检查。

### Docs & packaging · 文档与打包

- README: added a maintainer publish guide and a one-line `npx -y @walkcloud/synthetix-mcp` install as the primary method (Claude Code / Desktop / Cursor / Codex / OpenCode).
- `package.json`: scoped name `@walkcloud/synthetix-mcp`, `bin`, `files` whitelist, `publishConfig` public access, `prepublishOnly` build hook.

### Companion app version · 配套应用版本

Requires Synthetix **v1.1.0+** (the app's API access-key feature, released alongside this version). Earlier app versions lack the `/api/v1/users/api-keys` endpoints and Bearer-auth fallback.

## [1.0.0] — 2026-07-23

### Initial release · 首次发布

Pure adapter layer bridging AI agents (Claude Code, Codex, OpenCode) to the Synthetix app via its REST API. Zero business logic; the app stays unchanged. · 纯适配层,通过 REST API 把 AI 智能体接入 Synthetix,零业务逻辑,应用零改动。

- **33 tools**: async tasks (get_task_status/cancel/list), documents & knowledge (ingest/search/graph/wiki), brainstorm & outline (interactive guided with length-gate), writing (single section / batch generate-all auto-confirm / dual-model compare → confirm), export, model management, token usage.
- **3 prompts**: `longform-writing`, `quick-outline`, `dual-model-review`.
- **HttpClient** with json/binary/sse modes, Bearer auth injection, actionable error mapping.
- **`.mcp.json.example`** for one-step client setup.
- 16 tests passing, typecheck clean.
