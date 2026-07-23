import { z } from "zod";
import type { HttpClient, SseEvent } from "../client.js";
import { consumeGenerateStream, consumeCompareStream } from "../client.js";
import { ok, runTool , type ToolDef } from "../schemas.js";
import { POLL_HINT } from "../tasks.js";

export const writingTools: ToolDef[] = [
  {
    name: "create_draft",
    description:
      "创建写作草稿(章节与大纲一一对应)。两种来源二选一:" +
      "(1) sessionId:基于头脑风暴,自动从 session.outline 读取大纲;" +
      "(2) outline:直传大纲对象 { title, sections:[{num,title,...}] },跳过头脑风暴。" +
      "必须提供其一。",
    schema: {
      sessionId: z.string().optional().describe("基于头脑风暴大纲(自动读取,无需重传大纲)"),
      outline: z.record(z.unknown()).optional().describe("直传大纲对象,跳过头脑风暴"),
    },
    handler:
      (client: HttpClient) =>
      async ({ sessionId, outline }: { sessionId?: string; outline?: Record<string, unknown> }) =>
        runTool(async () => {
          if (!sessionId && !outline) {
            return {
              isError: true,
              content: [{ type: "text" as const, text: "必须提供 sessionId 或 outline 之一。" }],
            };
          }
          const r = await client.request<{ id: string; title: string; sections: Array<{ id: string; title: string; index: number; status: string }> }>(
            "/api/v1/drafts",
            { method: "POST", body: { sessionId, outline } }
          );
          return ok(
            {
              draftId: r.id,
              title: r.title,
              sections: r.sections.map((s) => ({ sectionId: s.id, title: s.title, index: s.index, status: s.status })),
            },
            "草稿已创建。用返回的 sectionId 调 generate_section(单章,完成后需 confirm)或 generate_all_sections(整篇,自动确认)开始写作。"
          );
        }),
  },
  {
    name: "list_drafts",
    description: "列出草稿(含每篇进度:已确认章节数、字数等)。",
    schema: {
      page: z.number().int().min(1).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    handler:
      (client: HttpClient) =>
      async (args: { page?: number; limit?: number }) =>
        runTool(async () => ok(await client.request("/api/v1/drafts", { params: args }))),
  },
  {
    name: "get_draft",
    description: "获取草稿详情,含全部章节及其状态、内容、引用。",
    schema: { draftId: z.string() },
    handler:
      (client: HttpClient) =>
      async ({ draftId }: { draftId: string }) =>
        runTool(async () => ok(await client.request(`/api/v1/drafts/${draftId}`))),
  },
  {
    name: "generate_section",
    description:
      "生成单个章节(SSE 流式,内部消费到完成)。完成后章节为 reviewing 状态," +
      "需调 confirm_section 确认后才能导出(区别于 generate_all_sections 的自动确认)。",
    schema: {
      draftId: z.string(),
      sectionId: z.string(),
      modelConfigId: z.string().optional().describe("指定 writing 模型,留空用默认"),
      additionalRequirements: z.string().optional().describe("本次生成的额外要求"),
    },
    handler:
      (client: HttpClient) =>
      async ({ draftId, sectionId, modelConfigId, additionalRequirements }: { draftId: string; sectionId: string; modelConfigId?: string; additionalRequirements?: string }) =>
        runTool(async () => {
          const body: Record<string, unknown> = {};
          if (modelConfigId) body.modelAConfigId = modelConfigId;
          if (additionalRequirements) body.constraints = { additionalRequirements };
          const stream = await client.request<AsyncGenerator<SseEvent>>(`/api/v1/drafts/${draftId}/sections/${sectionId}/generate`, {
            method: "POST",
            body,
            expect: "sse",
          });
          const { content, references } = await consumeGenerateStream(stream);
          const section = await client.request<{ status: string; wordCount: number | null }>(
            `/api/v1/drafts/${draftId}/sections/${sectionId}`
          );
          return ok(
            { sectionId, status: section.status, wordCount: section.wordCount, content, referenceCount: references.length },
            "生成完成,章节为 reviewing 状态。用 confirm_section(draftId, sectionId) 确认后才能导出。"
          );
        }),
  },
  {
    name: "generate_all_sections",
    description:
      "整篇一次性生成(异步任务)。完成后章节自动确认并锁定(status=locked)," +
      "内部已执行生成+摘要+版本归档+图表资产生成。可直接 assemble_preview 或 export_draft,无需再 confirm。",
    schema: {
      draftId: z.string(),
      overwrite: z.boolean().optional().describe("是否覆盖已生成章节,默认 false"),
      stopOnError: z.boolean().optional().describe("出错是否停止,默认 true"),
      modelConfigId: z.string().optional(),
    },
    handler:
      (client: HttpClient) =>
      async ({ draftId, overwrite, stopOnError, modelConfigId }: { draftId: string; overwrite?: boolean; stopOnError?: boolean; modelConfigId?: string }) =>
        runTool(async () => {
          const r = await client.request<{ taskId: string }>(`/api/v1/drafts/${draftId}/generate-all`, {
            method: "POST",
            body: { overwrite, stopOnError, modelConfigId },
          });
          return ok(
            { taskId: r.taskId },
            POLL_HINT + "\n完成后章节已自动锁定,可直接 assemble_preview 或 export_draft。"
          );
        }),
  },
  {
    name: "compare_section",
    description:
      "用两个不同模型对比生成一个章节(并行 A/B),产出两个候选供用户选择。这是双模型写作流程的第 1 步。" +
      "modelA/modelB 留空则用默认 writing 模型与自动选取的第二模型。",
    schema: {
      draftId: z.string(),
      sectionId: z.string(),
      modelAConfigId: z.string().optional().describe("模型 A,留空用默认 writing 模型"),
      modelBConfigId: z.string().optional().describe("模型 B,留空自动选取与 A 不同的模型"),
      additionalRequirements: z.string().optional(),
    },
    handler:
      (client: HttpClient) =>
      async ({ draftId, sectionId, modelAConfigId, modelBConfigId, additionalRequirements }: { draftId: string; sectionId: string; modelAConfigId?: string; modelBConfigId?: string; additionalRequirements?: string }) =>
        runTool(async () => {
          const body: Record<string, unknown> = {};
          if (modelAConfigId) body.modelAConfigId = modelAConfigId;
          if (modelBConfigId) body.modelBConfigId = modelBConfigId;
          if (additionalRequirements) body.constraints = { additionalRequirements };
          const stream = await client.request<AsyncGenerator<SseEvent>>(`/api/v1/drafts/${draftId}/sections/${sectionId}/compare`, {
            method: "POST",
            body,
            expect: "sse",
          });
          const { contentA, contentB, references } = await consumeCompareStream(stream);
          const section = await client.request<{ modelA: string | null; modelB: string | null }>(
            `/api/v1/drafts/${draftId}/sections/${sectionId}`
          );
          return ok(
            { modelA: section.modelA, modelB: section.modelB, contentA, contentB, referenceCount: references.length },
            "已生成两个模型候选。请让用户选择 A 或 B,然后用 confirm_section(draftId, sectionId, selectedSource:\"a\"|\"b\") 确认。" +
              "若某个 modelA/modelB 为空表示该模型失败,只能选有内容的那个。"
          );
        }),
  },
  {
    name: "confirm_section",
    description:
      "确认章节(锁定后才能导出)。两种场景:" +
      "(1) 单章节 generate 后的 reviewing 章节:不传 selectedSource,直接确认;" +
      "(2) compare 对比后的章节:必须传 selectedSource(\"a\"|\"b\") 选定候选。",
    schema: {
      draftId: z.string(),
      sectionId: z.string(),
      selectedSource: z.enum(["a", "b"]).optional().describe("对比场景下必填,选定 A 或 B 候选"),
    },
    handler:
      (client: HttpClient) =>
      async ({ draftId, sectionId, selectedSource }: { draftId: string; sectionId: string; selectedSource?: "a" | "b" }) =>
        runTool(async () => {
          if (selectedSource) {
            // Compare path: must select the candidate first, then confirm.
            await client.request(`/api/v1/drafts/${draftId}/sections/${sectionId}`, {
              method: "PUT",
              body: { selectedSource },
            });
          }
          const r = await client.request(`/api/v1/drafts/${draftId}/sections/${sectionId}/confirm`, { method: "POST" });
          return ok(r, "章节已确认并锁定,可纳入导出。");
        }),
  },
  {
    name: "edit_section",
    description: "手动编辑章节正文(直接替换 content)。",
    schema: {
      draftId: z.string(),
      sectionId: z.string(),
      content: z.string().describe("新的章节正文"),
    },
    handler:
      (client: HttpClient) =>
      async ({ draftId, sectionId, content }: { draftId: string; sectionId: string; content: string }) =>
        runTool(async () =>
          ok(await client.request(`/api/v1/drafts/${draftId}/sections/${sectionId}`, { method: "PUT", body: { content } }))
        ),
  },
  {
    name: "assemble_preview",
    description: "把已确认(locked/summarized)的章节组装成完整 markdown 预览。",
    schema: { draftId: z.string() },
    handler:
      (client: HttpClient) =>
      async ({ draftId }: { draftId: string }) =>
        runTool(async () => ok(await client.request(`/api/v1/drafts/${draftId}/assemble`, { method: "POST" }))),
  },
];
