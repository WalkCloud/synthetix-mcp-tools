# Synthetix MCP Server

English | [简体中文](#简体中文)

A Model Context Protocol server that lets AI agents (Claude Code, Codex, OpenCode) drive [Synthetix](https://github.com/WalkCloud/Synthetix) through natural language — ingest documents into a knowledge base, brainstorm outlines, write long-form docs with dual-model comparison, export, manage models, and check token usage, **all without opening a browser**.

This server is a pure adapter: it talks to the running Synthetix app over HTTP + an API key, contains no business logic, and requires zero changes on the app side.

<p align="center">
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue"></a>
  <img alt="npm" src="https://img.shields.io/npm/v/@walkcloud/synthetix-mcp?color=cb3837">
</p>

## What it can do

- 📥 **Ingest documents**: feed local PDF / Word / PPT / HTML / EPUB / Markdown files into the knowledge base; automatic chunking + vectorization + optional knowledge graph
- 🔍 **Search knowledge**: semantic and keyword search, with source tracing
- 💡 **Brainstorm**: multi-turn guided dialogue to clarify requirements and produce a structured outline
- ✍️ **Write long-form docs**: single-section or whole-document generation, with **dual-model A/B comparison** to pick the better version
- 📤 **Export**: Markdown / PDF / Word
- ⚙️ **Manage models & usage**: configure providers, view token consumption

## Prerequisites

1. **Synthetix is running** (`npm run dev` or the Electron desktop build, default `localhost:3000`)
2. **An API key has been created**: in the app → sidebar avatar menu → **API Keys** → create → copy (the plaintext is shown only once)
3. **Required models are configured** (needed for search/writing): set up embedding + LLM + chat models under **Model Management**

## Installation

### Option A: one-line npx config (recommended, zero install)

This package is published on npm (`@walkcloud/synthetix-mcp`). **No git clone, no build** — just add one line to your client config and `npx` pulls and runs it automatically:

**Claude Code** (one command):
```bash
claude mcp add --scope user synthetix \
  -e SYNTHETIX_API_KEY=sk-synt-your-key \
  -- npx -y @walkcloud/synthetix-mcp
```

**Claude Desktop / Cursor / VS Code** (JSON, `mcpServers`):
```json
{
  "mcpServers": {
    "synthetix": {
      "command": "npx",
      "args": ["-y", "@walkcloud/synthetix-mcp"],
      "env": {
        "SYNTHETIX_API_KEY": "sk-synt-your-key",
        "SYNTHETIX_BASE_URL": "http://localhost:3000"
      }
    }
  }
}
```

**Codex** (`~/.codex/config.toml`):
```toml
[mcp_servers.synthetix]
command = "npx"
args = ["-y", "@walkcloud/synthetix-mcp"]

[mcp_servers.synthetix.env]
SYNTHETIX_API_KEY = "sk-synt-your-key"
SYNTHETIX_BASE_URL = "http://localhost:3000"
```

**OpenCode** (`opencode.json` — note the `mcp` + `environment` keys):
```json
{
  "mcp": {
    "synthetix": {
      "type": "local",
      "command": ["npx", "-y", "@walkcloud/synthetix-mcp"],
      "enabled": true,
      "environment": {
        "SYNTHETIX_API_KEY": "sk-synt-your-key",
        "SYNTHETIX_BASE_URL": "http://localhost:3000"
      }
    }
  }
}
```

> ⚠️ **Windows users**: GUI clients (Claude Desktop / Cursor) may silently fail with `npx`. Change `command` to `cmd` and `args` to `["/c", "npx", "-y", "@walkcloud/synthetix-mcp"]`. The Claude Code CLI is unaffected.

### Option B: run from source (for local dev / before publishing)

```bash
git clone https://github.com/WalkCloud/synthetix-mcp-tools.git
cd synthetix-mcp-tools
npm install
```

Then launch your client from the repo directory using `.mcp.json` (Claude Code reads it automatically):

```bash
cp .mcp.json.example .mcp.json   # copy the template
# edit .mcp.json and fill in SYNTHETIX_API_KEY
claude                            # launch from the repo directory
```

In source mode, config runs `tsx` directly (edits take effect immediately, no build):
```json
{ "command": "npx", "args": ["-y", "tsx", "src/index.ts"] }
```

### Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `SYNTHETIX_API_KEY` | ✅ | — | A key created in the app under Settings → API Keys |
| `SYNTHETIX_BASE_URL` | no | `http://localhost:3000` | The app URL |
| `SYNTHETIX_LOCALE` | no | `zh-CN` | System message language (e.g. length-follow-up prompts) |

---

## How to use (what to say after opening the agent)

Once connected, **you don't need to remember tool names** — describe what you want in natural language and the agent picks the right tool.

### Conversation examples

| You say | What the agent does |
|---|---|
| "Upload this PDF to the knowledge base and process it in graph mode" | `ingest_document` (upload + process) → returns a taskId |
| "Search the knowledge base for 'lean startup'" | `search_knowledge` → returns results with sources |
| "I want to write a digital-transformation proposal for SMBs, standard length" | Starts brainstorming → generates an outline |
| "Write chapter 1 with deepseek and doubao, then compare" | `compare_section` → shows two versions for you to pick |
| "Just write the whole thing" | `generate_all_sections` (async, auto-confirms) |
| "Export as Word" | `export_draft` (format=docx) |

### Predefined workflows (slash commands)

Once connected, the agent exposes these **predefined commands** that launch a complete flow in one step (no need to describe the steps yourself):

- **`/longform-writing`** — Long-form writing sprint: topic → brainstorm → outline → per-section writing → (optional dual-model) → export. Just fill in the topic and length.
- **`/quick-outline`** — Quick outline: only generates a structured outline, no writing. Good for inspecting structure first.
- **`/dual-model-review`** — Dual-model review: rewrites each chapter of an existing draft with two models and compares them to pick the better version.
- **`/knowledge-deep-dive`** — Knowledge deep-read: deeply interprets an uploaded document, retrieves key points, distills a structured summary. Good for study/learning.
- **`/proposal-from-scratch`** — Proposal sprint: archetype-based (technical solution / proposal / bidding / consulting / etc.) fast generation of a structured long-form doc, skipping heavy brainstorm.
- **`/export-readiness-check`** — Export readiness check: verifies all draft sections are confirmed and exportable; lists any unconfirmed sections. A final check before export.

> Example: in Claude Code type `/longform-writing`, fill in topic "SMB digital transformation proposal" and length "standard", and the agent guides you through the whole document following the SOP.

### Typical end-to-end workflow (7 steps)

```
1. Ingest    ingest_document          → documentId + taskId (poll until ready)
2. Search    search_knowledge          → confirm material coverage
3. Clarify   brainstorm_message (loops)→ advance until requirements are clear
4. Outline   generate_outline → get_outline → create_draft (no need to re-pass the outline)
5. Write     generate_section / generate_all_sections
              └ single section: requires confirm_section before export
              └ whole document: auto-locks, directly exportable
6. Compare   compare_section → user picks → confirm_section(selectedSource)
7. Export    export_draft (markdown/pdf/docx)
```

Each step's output (documentId / sessionId / draftId / sectionId) feeds the next.

## Tools (33)

**Async tasks**: `get_task_status` · `cancel_task` · `list_tasks`
> Document processing, outline generation, whole-document writing, etc. return a `taskId`; poll with `get_task_status` (every 10–30s) until `completed`.

**Documents & knowledge**: `ingest_document` · `list_documents` · `get_document` · `search_knowledge` · `get_knowledge_graph` · `list_wiki_entries` · `get_wiki_entry` · `synthesize_wiki`

**Brainstorm & outline**: `create_brainstorm_session` · `brainstorm_message` · `generate_outline` · `get_outline` · `update_outline`

**Writing**: `create_draft` · `list_drafts` · `get_draft` · `generate_section` · `generate_all_sections` · `compare_section` · `confirm_section` · `edit_section` · `assemble_preview`

**Export & model management**: `export_draft` · `list_providers` · `create_provider` · `update_provider` · `delete_provider` · `set_default_model` · `test_connection` · `get_token_usage`

## Troubleshooting

**Q: Startup error "SYNTHETIX_API_KEY is required"**
A: No API key was passed. Add it to the client's `env` config (see Installation above).

**Q: A tool returns "API key invalid or revoked"**
A: The key is wrong or revoked. Recreate it in the app under Settings → API Keys.

**Q: Returns "Cannot connect to the Synthetix app"**
A: The app isn't running, or `SYNTHETIX_BASE_URL` is wrong. Make sure the app is running (`npm run dev`) and the URL is correct.

**Q: Search/writing returns "embedding/LLM model not configured"**
A: Knowledge-base search needs embedding+LLM models; writing needs a chat model. Configure them under Model Management.

**Q: Export to PDF/Word fails**
A: PDF depends on Playwright Chromium, Word on python-docx. If missing, export as markdown instead.

**Q: A call returned a taskId — now what?**
A: Long tasks (document processing / outline / whole-document writing) are async. Poll with `get_task_status(taskId)` until status becomes `completed` / `failed` / `cancelled`. Don't assume the first call returns the result.

**Q: Doesn't work on Windows**
A: GUI clients may silently fail with `npx`; change to `"command": "cmd", "args": ["/c", "npx", ...]` (see the Windows note in Installation). The Claude Code CLI is unaffected.

**Q: How to debug the server itself?**
A: Use the official MCP Inspector: `npx -y @modelcontextprotocol/inspector npx -y tsx src/index.ts`. With env set, you can test each tool in the browser.

## Development

```bash
npm install
npm run dev        # run source directly with tsx (no build, edits take effect immediately)
npm run build      # compile to dist/ (only needed for publishing)
npm test           # run tests
npm run typecheck  # type-check
```

## Maintainer publish guide

To publish a new version to npm (`@walkcloud/synthetix-mcp`):

```bash
# 1. Bump version in package.json (e.g. 1.1.0 → 1.2.0)
# 2. Commit and push
git add -A && git commit -m "release: vX.Y.Z" && git push

# 3. Publish (prepublishOnly auto-builds)
npm publish --access public
```

> Publishing requires an `@walkcloud` scope publish token (configured in `~/.npmrc`, with 2FA bypass, valid 90 days). If it expires or leaks, regenerate at https://www.npmjs.com/settings/kevinlee822/tokens and run `npm config set //registry.npmjs.org/:_authToken <new-token>`.
>
> After publishing, global registry propagation takes ~5–15 minutes; `npm view @walkcloud/synthetix-mcp` may briefly 404 during this window.

## Security

- API keys are stored as SHA-256 hashes on the app side and invalidated immediately on revocation.
- This server is only an HTTP client holding a key; it does not cache credentials or document content.
- Model-management tools never echo secrets (the app only returns an `hasApiKey` boolean).
- `.mcp.json` (with a real key) is git-ignored; only the `.mcp.json.example` template is committed.

## License

[Apache License 2.0](./LICENSE). Consistent with the main [Synthetix](https://github.com/WalkCloud/Synthetix) repo.

---

# 简体中文

[English](#english) | 简体中文

# Synthetix MCP Server

让 Claude Code、Codex、OpenCode 等智能体通过自然语言驱动 [Synthetix](https://github.com/WalkCloud/Synthetix)——上传文档构建知识库、头脑风暴生成大纲、撰写长文、双模型对比、导出、管理模型、查看 token 用量,**全程无需打开浏览器**。

本 server 是纯适配层:通过 HTTP + API Key 调用运行中的 Synthetix 应用,不含业务逻辑,应用侧零改动。

## 它能做什么

- 📥 **摄入文档**:把本地 PDF/Word/PPT/网页等喂进知识库,自动分块+向量化+可选图谱
- 🔍 **检索知识**:语义/关键词搜索,带来源追溯
- 💡 **头脑风暴**:多轮引导式对话梳理需求,生成结构化大纲
- ✍️ **撰写长文**:单章/整篇生成,**双模型 A/B 对比**选出更优版本
- 📤 **导出**:Markdown / PDF / Word
- ⚙️ **管理模型与用量**:配置 provider、查看 token 消耗

## 前置条件

1. **Synthetix 应用正在运行**(`npm run dev` 或 Electron 桌面版,默认 `localhost:3000`)
2. **已创建 API Key**:应用 → 侧边栏头像菜单 → **API 密钥** → 创建 → 复制(明文仅显示一次)
3. **已配置所需模型**(检索/写作需要):「模型管理」中配好 embedding + LLM + chat 模型

## 安装

### 方式一:npx 一行配置(推荐,发布后零安装)

本包发布在 npm(`@walkcloud/synthetix-mcp`)。用户**无需 git clone、无需 build**——只需在客户端配置里写一行,`npx` 会自动拉取运行:

**Claude Code**(一行命令):
```bash
claude mcp add --scope user synthetix \
  -e SYNTHETIX_API_KEY=sk-synt-你的密钥 \
  -- npx -y @walkcloud/synthetix-mcp
```

**Claude Desktop / Cursor / VS Code**(JSON,`mcpServers`):
```json
{
  "mcpServers": {
    "synthetix": {
      "command": "npx",
      "args": ["-y", "@walkcloud/synthetix-mcp"],
      "env": {
        "SYNTHETIX_API_KEY": "sk-synt-你的密钥",
        "SYNTHETIX_BASE_URL": "http://localhost:3000"
      }
    }
  }
}
```

**Codex**(`~/.codex/config.toml`):
```toml
[mcp_servers.synthetix]
command = "npx"
args = ["-y", "@walkcloud/synthetix-mcp"]

[mcp_servers.synthetix.env]
SYNTHETIX_API_KEY = "sk-synt-你的密钥"
SYNTHETIX_BASE_URL = "http://localhost:3000"
```

**OpenCode**(`opencode.json`,注意键是 `mcp` + `environment`):
```json
{
  "mcp": {
    "synthetix": {
      "type": "local",
      "command": ["npx", "-y", "@walkcloud/synthetix-mcp"],
      "enabled": true,
      "environment": {
        "SYNTHETIX_API_KEY": "sk-synt-你的密钥",
        "SYNTHETIX_BASE_URL": "http://localhost:3000"
      }
    }
  }
}
```

> ⚠️ **Windows 用户**:GUI 客户端(Claude Desktop/Cursor)用 `npx` 可能静默失败,需把 command 改为 `cmd`,args 改为 `["/c", "npx", "-y", "@walkcloud/synthetix-mcp"]`。Claude Code 命令行版不受此影响。

### 方式二:从源码运行(本地开发/未发布时)

```bash
git clone https://github.com/WalkCloud/synthetix-mcp-tools.git
cd synthetix-mcp-tools
npm install
```

然后在仓库目录下用 `.mcp.json` 启动(Claude Code 会自动读取):

```bash
cp .mcp.json.example .mcp.json   # 复制模板
# 编辑 .mcp.json 填入 SYNTHETIX_API_KEY
claude                            # 在仓库目录下启动
```

源码模式下配置用 `tsx` 直跑(改完即生效,免 build):
```json
{ "command": "npx", "args": ["-y", "tsx", "src/index.ts"] }
```

### 配置项

| 变量 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `SYNTHETIX_API_KEY` | ✅ | — | 应用「设置 → API 密钥」创建的 key |
| `SYNTHETIX_BASE_URL` | 否 | `http://localhost:3000` | 应用地址 |
| `SYNTHETIX_LOCALE` | 否 | `zh-CN` | 系统消息语言(如篇幅追问话术) |

---

## 怎么用(打开智能体后说什么)

连接成功后,**你不需要记工具名**——用自然语言描述需求,智能体会自动选对工具。

### 对话示例

| 你说 | 智能体会做什么 |
|---|---|
| "把这份 PDF 上传到知识库,用图谱模式处理" | `ingest_document`(上传+处理)→ 返回 taskId |
| "帮我检索一下'精益创业'相关的资料" | `search_knowledge` → 返回带来源的结果 |
| "我要写一份中小企业数字化转型方案,标准篇幅" | 开始头脑风暴 → 生成大纲 |
| "用 deepseek 和 doubao 两个模型分别写第一章,对比一下" | `compare_section` → 展示两版让你选 |
| "整篇都写了吧" | `generate_all_sections`(异步,自动确认) |
| "导出成 Word" | `export_draft`(format=docx) |

### 预置工作流(斜杠命令)

连接后,智能体会暴露这些**预置命令**,一键启动完整流程(无需自己描述步骤):

- **`/longform-writing`** 长文写作冲刺:主题 → 头脑风暴 → 大纲 → 逐章写作 → (可选双模型)→ 导出。填入主题和篇幅即可。
- **`/quick-outline`** 快速大纲:仅生成结构化大纲,不写作。适合先看结构。
- **`/dual-model-review`** 双模型审稿:对已有草稿逐章用两模型重写对比,选出更优版。
- **`/knowledge-deep-dive`** 知识深读:对一篇已上传文档做深度解读,检索要点、提炼结构化摘要。适合研读/学习。
- **`/proposal-from-scratch`** 方案速成:基于原型(技术方案/投标/咨询等)从零高效生成结构完整的长文,跳过冗长头脑风暴。
- **`/export-readiness-check`** 导出就绪检查:核对草稿是否所有章节已确认可导出,列出未完成项。导出前最后一道核对。

> 用法示例:在 Claude Code 里输入 `/longform-writing`,填入主题"中小企业数字化转型方案"、篇幅"standard",智能体会按 SOP 引导你完成全文。

### 典型端到端工作流(7 步)

```
1. 摄入    ingest_document          → documentId + taskId(轮询直到就绪)
2. 检索    search_knowledge          → 确认资料覆盖度
3. 梳理    brainstorm_message(多轮) → 推进到需求明确
4. 大纲    generate_outline → get_outline → create_draft(无需重传大纲)
5. 写作    generate_section / generate_all_sections
              └ 单章:生成后需 confirm_section 才能导出
              └ 整篇:自动锁定,直接可导出
6. 对比    compare_section → 让用户选 → confirm_section(selectedSource)
7. 导出    export_draft(markdown/pdf/docx)
```

每一步的产物(documentId / sessionId / draftId / sectionId)会自动传递给下一步。

## 工具一览(33 个)

**通用任务**:`get_task_status` · `cancel_task` · `list_tasks`
> 文档处理、大纲生成、整篇写作等返回 `taskId` 后,用 `get_task_status` 轮询(建议 10–30 秒)直到 `completed`。

**文档与知识库**:`ingest_document` · `list_documents` · `get_document` · `search_knowledge` · `get_knowledge_graph` · `list_wiki_entries` · `get_wiki_entry` · `synthesize_wiki`

**头脑风暴与大纲**:`create_brainstorm_session` · `brainstorm_message` · `generate_outline` · `get_outline` · `update_outline`

**写作**:`create_draft` · `list_drafts` · `get_draft` · `generate_section` · `generate_all_sections` · `compare_section` · `confirm_section` · `edit_section` · `assemble_preview`

**导出与模型设置**:`export_draft` · `list_providers` · `create_provider` · `update_provider` · `delete_provider` · `set_default_model` · `test_connection` · `get_token_usage`

## 故障排查

**Q: 启动报错 "SYNTHETIX_API_KEY is required"**
A: 没有传 API Key。在客户端的 `env` 配置里加上(见上方安装步骤)。

**Q: 调用工具返回 "API key 无效或已吊销"**
A: Key 错了或被吊销。回应用用「设置 → API 密钥」重新创建。

**Q: 返回 "无法连接 Synthetix 应用"**
A: 应用没运行,或 `SYNTHETIX_BASE_URL` 错。确认应用在跑(`npm run dev`),且地址正确。

**Q: 检索/写作返回 "尚未配置 embedding/LLM 模型"**
A: 知识库检索需 embedding+LLM 模型,写作需 chat 模型。去应用「模型管理」配置。

**Q: 导出 PDF/Word 失败**
A: PDF 依赖 Playwright Chromium,Word 依赖 python-docx。缺失时改用 markdown 格式导出。

**Q: 调用返回了 taskId,然后呢?**
A: 长任务(文档处理/大纲/整篇写作)是异步的。用 `get_task_status(taskId)` 轮询,直到 status 变 `completed`/`failed`/`cancelled`。别假设第一次调用就拿到结果。

**Q: Windows 上配了不生效**
A: GUI 客户端用 `npx` 会静默失败,改成 `"command": "cmd", "args": ["/c", "npx", ...]`(见安装步骤的 Windows 说明)。Claude Code 命令行版不受此影响。

**Q: 怎么调试 server 本身?**
A: 用官方 MCP Inspector:`npx -y @modelcontextprotocol/inspector npx -y tsx src/index.ts`,带 env 即可在浏览器里测试每个工具。

## 开发

```bash
npm install
npm run dev        # tsx 直接跑源码(改完即跑,免 build)
npm run build      # 编译到 dist/(仅发布时需要)
npm test           # 运行测试
npm run typecheck  # 类型检查
```

## 维护者发布指南

发布到 npm(`@walkcloud/synthetix-mcp`)。每次发新版:

```bash
# 1. 改 package.json 里的 version(如 1.1.0 → 1.2.0)
# 2. 提交并推送代码
git add -A && git commit -m "release: vX.Y.Z" && git push

# 3. 发布(prepublishOnly 会自动 build,无需手动 build)
npm publish --access public
```

> 发布需要 `@walkcloud` scope 的发布令牌(已配置在 `~/.npmrc`,带 2FA 豁免,90 天有效)。令牌过期或泄露后,到 https://www.npmjs.com/settings/kevinlee822/tokens 重新生成,再 `npm config set //registry.npmjs.org/:_authToken <新令牌>`。
>
> 发布后 registry 全球同步约需 5–15 分钟,期间 `npm view @walkcloud/synthetix-mcp` 可能短暂 404,属正常现象。

## 安全说明

- API Key 在应用侧 SHA-256 哈希存储,吊销后立即失效。
- 本 server 仅是持有 key 的 HTTP 客户端,不缓存凭证或文档内容。
- 模型管理工具永不回显密钥(应用侧仅返回 `hasApiKey` 布尔)。
- `.mcp.json`(含真实 key)已被 `.gitignore` 忽略,只提交 `.mcp.json.example` 模板。

## 许可证

[Apache License 2.0](./LICENSE)。与主仓库 [Synthetix](https://github.com/WalkCloud/Synthetix) 一致。
