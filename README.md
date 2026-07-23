# Synthetix MCP Server

让 Claude Code、Codex、OpenCode 等智能体通过自然语言驱动 [Synthetix](https://github.com/WalkCloud/Synthetix)——上传文档构建知识库、头脑风暴生成大纲、撰写长文、双模型对比、导出、管理模型、查看 token 用量,**全程无需打开浏览器**。

本 server 是纯适配层:通过 HTTP + API Key 调用运行中的 Synthetix 应用,不含业务逻辑,应用侧零改动。

---

## 它能做什么

- 📥 **摄入文档**:把本地 PDF/Word/PPT/网页等喂进知识库,自动分块+向量化+建图谱
- 🔍 **检索知识**:语义/关键词搜索,带来源追溯
- 💡 **头脑风暴**:多轮引导式对话梳理需求,生成结构化大纲
- ✍️ **撰写长文**:单章/整篇生成,**双模型 A/B 对比**选出更优版本
- 📤 **导出**:Markdown / PDF / Word
- ⚙️ **管理模型与用量**:配置 provider、查看 token 消耗

---

## 前置条件

1. **Synthetix 应用正在运行**(`npm run dev` 或 Electron 桌面版,默认 `localhost:3000`)
2. **已创建 API Key**:应用 → 侧边栏头像菜单 → **API 密钥** → 创建 → 复制(明文仅显示一次)
3. **已配置所需模型**(检索/写作需要):「模型管理」中配好 embedding + LLM + chat 模型

---

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

**Codex**(`~/.codex/config.toml`,TOML):

```toml
[mcp_servers.synthetix]
command = "npx"
args = ["-y", "tsx", "src/index.ts"]

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
      "command": ["npx", "-y", "tsx", "src/index.ts"],
      "enabled": true,
      "environment": {
        "SYNTHETIX_API_KEY": "sk-synt-你的密钥",
        "SYNTHETIX_BASE_URL": "http://localhost:3000"
      }
    }
  }
}
```

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

---

## 工具一览(33 个)

**通用任务**:`get_task_status` · `cancel_task` · `list_tasks`
> 文档处理、大纲生成、整篇写作等返回 `taskId` 后,用 `get_task_status` 轮询(建议 10–30 秒)直到 `completed`。

**文档与知识库**:`ingest_document` · `list_documents` · `get_document` · `search_knowledge` · `get_knowledge_graph` · `list_wiki_entries` · `get_wiki_entry` · `synthesize_wiki`

**头脑风暴与大纲**:`create_brainstorm_session` · `brainstorm_message` · `generate_outline` · `get_outline` · `update_outline`

**写作**:`create_draft` · `list_drafts` · `get_draft` · `generate_section` · `generate_all_sections` · `compare_section` · `confirm_section` · `edit_section` · `assemble_preview`

**导出与模型设置**:`export_draft` · `list_providers` · `create_provider` · `update_provider` · `delete_provider` · `set_default_model` · `test_connection` · `get_token_usage`

---

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

---

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
# 1. 改 package.json 里的 version(如 1.0.0 → 1.1.0)
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

## License · 许可证

[Apache License 2.0](./LICENSE). 与主仓库 [Synthetix](https://github.com/WalkCloud/Synthetix) 一致。
