import { z } from "zod";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import type { HttpClient } from "../client.js";
import { ok, runTool, processingOptionsSchema, queryModeSchema , type ToolDef } from "../schemas.js";
import { POLL_HINT } from "../tasks.js";

const SUPPORTED_EXTS = ["pdf", "docx", "pptx", "html", "epub", "txt", "md"];

export const documentsTools: ToolDef[] = [
  {
    name: "ingest_document",
    description:
      "将一个本地文档文件摄入知识库(上传到 Synthetix 应用并可选地触发处理)。" +
      `支持格式:${SUPPORTED_EXTS.join("/")}。返回 documentId;若 process=true(默认)还会返回 taskId——` +
      "文档处理(转换+分块+向量化)是异步长任务,大文档可能数分钟,需用 get_task_status 轮询直到 completed。",
    schema: {
      path: z.string().describe("本地文件的绝对路径"),
      process: z.boolean().optional().describe("上传后是否立即触发处理(分块+向量化+可选图谱)。默认 true"),
      options: processingOptionsSchema.optional().describe("处理选项:索引模式/Wiki 开关等"),
    },
    handler:
      (client: HttpClient) =>
      async ({ path, process = true, options }: { path: string; process?: boolean; options?: { indexMode?: "basic" | "graph"; wikiEnabled?: boolean; forceReconnect?: boolean } }) =>
        runTool(async () => {
          const ext = extname(path).slice(1).toLowerCase();
          if (!SUPPORTED_EXTS.includes(ext)) {
            return {
              isError: true,
              content: [{ type: "text" as const, text: `不支持的文件格式 .${ext}。支持:${SUPPORTED_EXTS.join("/")}` }],
            };
          }
          if (!existsSync(path)) {
            return {
              isError: true,
              content: [{ type: "text" as const, text: `文件不存在:${path}` }],
            };
          }
          const fileBytes = await readFile(path);
          const form = new FormData();
          form.append("file", new Blob([fileBytes]), basename(path));
          // The upload endpoint returns a JSON envelope { document: {...} }.
          const uploadResult = await client.request<{ document: { id: string; status: string } }>(
            "/api/v1/documents/upload",
            { method: "POST", body: form }
          );
          const documentId = uploadResult.document.id;
          let status = uploadResult.document.status;

          if (!process) {
            return ok({ documentId, status, note: "文档已上传但未处理。需要时调 ingest_document 再次传入或用应用 UI 触发处理。" });
          }

          const procResult = await client.request<{ documentId: string; taskId: string; deduped?: boolean }>(
            `/api/v1/documents/${documentId}/reprocess`,
            { method: "POST", body: { options: options ?? {} } }
          );
          return ok(
            { documentId, taskId: procResult.taskId, status: "queued", deduped: procResult.deduped ?? false },
            POLL_HINT
          );
        }),
  },
  {
    name: "list_documents",
    description: "列出知识库中的文档(默认排除未处理的 pending 文档)。",
    schema: {
      status: z.string().optional().describe("按状态过滤:ready(就绪可检索)/failed/pending(未处理)/converting 等。默认排除 pending"),
      limit: z.number().int().min(1).max(100).optional().describe("每页数量,默认 20,上限 100"),
      page: z.number().int().min(1).optional().describe("页码,默认 1"),
    },
    handler:
      (client: HttpClient) =>
      async (args: { status?: string; limit?: number; page?: number }) =>
        runTool(async () =>
          ok(await client.request("/api/v1/documents", { params: { status: args.status, limit: args.limit, page: args.page } }))
        ),
  },
  {
    name: "get_document",
    description: "获取单个文档的详情与处理状态。",
    schema: { documentId: z.string().describe("文档 ID(由 ingest_document 返回或从 list_documents 获取)") },
    handler:
      (client: HttpClient) =>
      async ({ documentId }: { documentId: string }) =>
        runTool(async () => ok(await client.request(`/api/v1/documents/${documentId}`))),
  },
  {
    name: "search_knowledge",
    description:
      "语义检索知识库(基于向量 + LightRAG)。返回带来源追溯的检索结果(每条含来源文档/chunk/相关度)。" +
      "依赖应用已配置 embedding + LLM 模型;未配置会返回错误提示。适合在写作前确认资料覆盖度。",
    schema: {
      query: z.string().describe("检索查询(自然语言,如'精益创业的核心方法')"),
      mode: queryModeSchema.optional(),
      limit: z.number().int().min(1).max(100).optional().describe("返回结果数,默认 20"),
    },
    handler:
      (client: HttpClient) =>
      async (args: { query: string; mode?: string; limit?: number }) =>
        runTool(async () =>
          ok(await client.request("/api/v1/library/search/semantic", { method: "POST", body: args }))
        ),
  },
];

export const knowledgeTools: ToolDef[] = [
  {
    name: "get_knowledge_graph",
    description: "获取知识图谱(实体关系),用于了解实体之间的关联。依赖 embedding+LLM 模型。",
    schema: {
      depth: z.number().int().min(1).max(10).optional().describe("从聚焦实体向外展开的深度,默认 3"),
      focusEntity: z.string().optional().describe("聚焦的实体名(留空返回整体概览)"),
      mode: z.enum(["core", "overview"]).optional().describe("core=聚焦某实体周围;overview=整体概览。默认 core"),
    },
    handler:
      (client: HttpClient) =>
      async (args: { depth?: number; focusEntity?: string; mode?: string }) =>
        runTool(async () =>
          ok(await client.request("/api/v1/knowledge/graph", { params: { depth: args.depth, entity: args.focusEntity, mode: args.mode } }))
        ),
  },
  {
    name: "list_wiki_entries",
    description: "列出 Wiki 知识条目(LLM 合成的概念/主题/论断层)。",
    schema: {
      type: z.enum(["doc_summary", "topic", "concept", "claim"]).optional(),
      q: z.string().optional().describe("全文搜索关键词"),
      limit: z.number().int().min(1).max(100).optional(),
    },
    handler:
      (client: HttpClient) =>
      async (args: { type?: string; q?: string; limit?: number }) =>
        runTool(async () => ok(await client.request("/api/v1/wiki/entries", { params: args }))),
  },
  {
    name: "get_wiki_entry",
    description: "获取单个 Wiki 条目的完整内容。",
    schema: { wikiId: z.string() },
    handler:
      (client: HttpClient) =>
      async ({ wikiId }: { wikiId: string }) =>
        runTool(async () => ok(await client.request(`/api/v1/wiki/entries/${wikiId}`))),
  },
  {
    name: "synthesize_wiki",
    description: "为已就绪的文档触发 Wiki 合成(异步任务)。",
    schema: { documentId: z.string() },
    handler:
      (client: HttpClient) =>
      async ({ documentId }: { documentId: string }) =>
        runTool(async () => {
          const r = await client.request<{ taskId: string }>("/api/v1/wiki/synthesize", { method: "POST", body: { documentId } });
          return ok(r, POLL_HINT);
        }),
  },
];
