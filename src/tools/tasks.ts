import { z } from "zod";
import type { HttpClient } from "../client.js";
import { getTaskStatus, cancelTask, POLL_HINT } from "../tasks.js";
import { ok, runTool, type ToolDef } from "../schemas.js";

export const tasksTools: ToolDef[] = [
  {
    name: "get_task_status",
    description:
      "查询异步任务状态。文档处理、大纲生成、整篇写作、Wiki 合成等都会返回 taskId,需用本工具轮询。" +
      "建议间隔 10–30 秒,直到 status 为 completed/failed/cancelled。result 字段含实时进度与最终产物。",
    schema: {
      taskId: z.string().describe("任务 ID(由 ingest_document/generate_outline/generate_all_sections 等返回)"),
    },
    handler:
      (client: HttpClient) =>
      async ({ taskId }: { taskId: string }) =>
        runTool(async () => ok(await getTaskStatus(client, taskId))),
  },
  {
    name: "cancel_task",
    description:
      "取消一个仍在进行的异步任务(状态为 pending/running/cancel_requested)。" +
      "已处于终态(completed/failed/cancelled)的任务无法取消。取消后用 get_task_status 确认最终状态。",
    schema: {
      taskId: z.string().describe("要取消的任务 ID"),
    },
    handler:
      (client: HttpClient) =>
      async ({ taskId }: { taskId: string }) =>
        runTool(async () => ok(await cancelTask(client, taskId), "任务已请求取消,用 get_task_status 确认最终状态。")),
  },
  {
    name: "list_tasks",
    description: "列出异步任务,可按类型/状态过滤。",
    schema: {
      type: z
        .enum([
          "document_convert",
          "rag_embed_index",
          "rag_index",
          "document_segment",
          "wiki_synthesize",
          "outline_generate",
          "draft_generate_all",
          "document_cleanup",
        ])
        .optional()
        .describe("任务类型过滤"),
      status: z
        .enum(["pending", "running", "completed", "failed", "cancelled", "cancel_requested"])
        .optional()
        .describe("状态过滤(可传逗号分隔多个,如 'running,completed')"),
      limit: z.number().int().min(1).max(200).optional().describe("返回数量,默认 50,上限 200"),
    },
    handler:
      (client: HttpClient) =>
      async (args: { type?: string; status?: string; limit?: number }) =>
        runTool(async () =>
          ok(await client.request("/api/v1/tasks", { params: { type: args.type, status: args.status, limit: args.limit } }))
        ),
  },
];

export { POLL_HINT };
