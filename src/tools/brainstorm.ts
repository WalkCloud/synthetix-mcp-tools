import { z } from "zod";
import type { HttpClient } from "../client.js";
import { ok, runTool , type ToolDef } from "../schemas.js";
import { POLL_HINT } from "../tasks.js";

const PHASE_DESC =
  "对话阶段。marker 含义速查:NEEDS_GATHERED=需求收集完毕;DIRECTION_CONFIRMED=大纲方向已确认;" +
  "GENERATE_DIRECT=用户选择直接生成大纲;SECTION_BY_SECTION=用户选择逐章细化;" +
  "ALL_SECTIONS_CONFIRMED=逐章确认完毕,可生成大纲。" +
  "\n\n【篇幅门控】即使用户想推进,若尚未明确篇幅(字数/页数),marker 可能为 null 且 message 变成追问篇幅的固定文案;" +
  "此时需继续回答篇幅问题直到确认。";

export const brainstormTools: ToolDef[] = [
  {
    name: "create_brainstorm_session",
    description: "创建一个头脑风暴会话——梳理文档需求并生成大纲的起点。",
    schema: { title: z.string().optional().describe("会话标题,留空则用默认标题") },
    handler:
      (client: HttpClient) =>
      async ({ title }: { title?: string }) =>
        runTool(async () =>
          ok(
            await client.request("/api/v1/brainstorm/sessions", { method: "POST", body: title ? { title } : {} }),
            "已创建会话。用 brainstorm_message 开始多轮对话梳理需求。"
          )
        ),
  },
  {
    name: "brainstorm_message",
    description:
      "在头脑风暴会话中发送一条消息并获取 AI 引导回复(多轮)。AI 会逐步提问梳理需求," +
      "最终产出大纲。回复中的 marker 字段标识阶段推进;phase 字段为当前阶段。" +
      PHASE_DESC,
    schema: {
      sessionId: z.string(),
      content: z.string().describe("用户消息内容"),
      clientMarker: z
        .enum(["GENERATE_DIRECT", "SECTION_BY_SECTION", "ALL_SECTIONS_CONFIRMED"])
        .optional()
        .describe("可选:直接声明用户选择(跳过AI推断)。GENERATE_DIRECT=直接生成;SECTION_BY_SECTION=逐章细化;ALL_SECTIONS_CONFIRMED=逐章确认完毕"),
      phase: z
        .enum(["gathering", "direction", "mode_select", "section_refine", "ready_to_generate", "ready"])
        .optional()
        .describe("当前阶段,默认 gathering"),
    },
    handler:
      (client: HttpClient) =>
      async (args: { sessionId: string; content: string; clientMarker?: string; phase?: string }) =>
        runTool(async () =>
          ok(await client.request(`/api/v1/brainstorm/sessions/${args.sessionId}/message`, { method: "POST", body: args }))
        ),
  },
  {
    name: "generate_outline",
    description:
      "基于头脑风暴对话触发大纲生成(异步任务)。完成后大纲自动存入该 session。" +
      "\n\n【衔接提示】完成后用 get_outline(sessionId) 读取大纲展示给用户确认/修改;" +
      "用户认可后用 create_draft(sessionId) 创建草稿——无需重传大纲,草稿会自动从 session 读取大纲。",
    schema: {
      sessionId: z.string(),
      modelConfigId: z.string().optional().describe("指定 chat 模型,留空用默认 chat 模型"),
    },
    handler:
      (client: HttpClient) =>
      async ({ sessionId, modelConfigId }: { sessionId: string; modelConfigId?: string }) =>
        runTool(async () => {
          const r = await client.request<{ taskId: string }>(`/api/v1/brainstorm/sessions/${sessionId}/generate-outline`, {
            method: "POST",
            body: modelConfigId ? { modelConfigId } : {},
          });
          return ok(r, POLL_HINT);
        }),
  },
  {
    name: "get_outline",
    description: "读取头脑风暴会话当前的大纲(从 session.outline)。",
    schema: { sessionId: z.string() },
    handler:
      (client: HttpClient) =>
      async ({ sessionId }: { sessionId: string }) =>
        runTool(async () => ok(await client.request(`/api/v1/brainstorm/sessions/${sessionId}`))),
  },
  {
    name: "update_outline",
    description: "保存用户对大纲的修改(持久化到 session.outline)。",
    schema: {
      sessionId: z.string(),
      outline: z.record(z.unknown()).describe("大纲对象 { title, sections:[...] }"),
    },
    handler:
      (client: HttpClient) =>
      async ({ sessionId, outline }: { sessionId: string; outline: Record<string, unknown> }) =>
        runTool(async () =>
          ok(
            await client.request(`/api/v1/brainstorm/outlines/${sessionId}`, { method: "PUT", body: { outline } }),
            "大纲已保存。可用 create_draft(sessionId) 创建草稿。"
          )
        ),
  },
];
