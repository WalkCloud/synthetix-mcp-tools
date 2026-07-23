import { z } from "zod";
import type { HttpClient } from "../client.js";
import { ok, runTool , type ToolDef } from "../schemas.js";

export const modelsTools: ToolDef[] = [
  {
    name: "list_providers",
    description: "列出已配置的模型 provider 及其模型。注意:apiKey 永远只返回 hasApiKey 布尔,不回显密钥。",
    schema: {},
    handler:
      (client: HttpClient) =>
      async () => runTool(async () => ok(await client.request("/api/v1/models/providers"))),
  },
  {
    name: "create_provider",
    description:
      "创建一个模型 provider(OpenAI 兼容/Anthropic/Ollama)及其模型配置。" +
      "apiKey 会加密存储。embedding 模型会自动探测维度。",
    schema: {
      name: z.string(),
      providerType: z.enum(["openai_compatible", "anthropic", "ollama"]).describe("openai_compatible(推荐)/anthropic/ollama"),
      apiBaseUrl: z.string().describe("API 基础 URL,如 https://api.openai.com"),
      apiKey: z.string().describe("API 密钥(将加密存储)"),
      models: z
        .array(
          z.object({
            modelId: z.string(),
            modelName: z.string(),
            capabilities: z.array(z.string()).describe("能力:chat/embedding/rerank/image"),
            contextWindow: z.number().int(),
            maxOutputTokens: z.number().int().optional(),
            inputPrice: z.number().optional(),
            outputPrice: z.number().optional(),
          })
        )
        .min(1),
    },
    handler:
      (client: HttpClient) =>
      async (args: Record<string, unknown>) =>
        runTool(async () => ok(await client.request("/api/v1/models/providers", { method: "POST", body: args }))),
  },
  {
    name: "update_provider",
    description: "更新一个 provider(含 models 时会先删后建该 provider 的所有模型配置)。",
    schema: {
      providerId: z.string(),
      name: z.string().optional(),
      providerType: z.enum(["openai_compatible", "anthropic", "ollama"]).optional(),
      apiBaseUrl: z.string().optional(),
      apiKey: z.string().optional().describe("留空则保持原密钥"),
      models: z
        .array(
          z.object({
            modelId: z.string(),
            modelName: z.string(),
            capabilities: z.array(z.string()),
            contextWindow: z.number().int(),
            maxOutputTokens: z.number().int().optional(),
          })
        )
        .optional(),
    },
    handler:
      (client: HttpClient) =>
      async ({ providerId, ...rest }: { providerId: string } & Record<string, unknown>) =>
        runTool(async () => ok(await client.request(`/api/v1/models/providers/${providerId}`, { method: "PUT", body: rest }))),
  },
  {
    name: "delete_provider",
    description: "删除一个 provider(级联删除其所有模型配置)。",
    schema: { providerId: z.string() },
    handler:
      (client: HttpClient) =>
      async ({ providerId }: { providerId: string }) =>
        runTool(async () => ok(await client.request(`/api/v1/models/providers/${providerId}`, { method: "DELETE" }))),
  },
  {
    name: "set_default_model",
    description: "将某模型设为某用途(llm/embedding/rerank/image)的默认。",
    schema: {
      modelConfigId: z.string(),
      defaultFor: z.enum(["llm", "embedding", "rerank", "image"]).describe("用途槽位"),
    },
    handler:
      (client: HttpClient) =>
      async ({ modelConfigId, defaultFor }: { modelConfigId: string; defaultFor: string }) =>
        runTool(async () =>
          ok(await client.request(`/api/v1/models/configs/${modelConfigId}/default`, { method: "PATCH", body: { setDefault: true, defaultFor } }))
        ),
  },
  {
    name: "test_connection",
    description: "测试 provider 连通性,并自动探测 context window 与 embedding 维度。",
    schema: { providerId: z.string() },
    handler:
      (client: HttpClient) =>
      async ({ providerId }: { providerId: string }) =>
        runTool(async () => ok(await client.request(`/api/v1/models/providers/${providerId}/test`, { method: "POST" }))),
  },
  {
    name: "get_token_usage",
    description: "查询 token 用量(按模型/模块汇总,含最近明细)。",
    schema: {
      module: z.string().optional().describe("按模块过滤,如 writing/brainstorm/embedding"),
      days: z.number().int().min(1).max(365).optional().describe("统计天数,默认 30"),
    },
    handler:
      (client: HttpClient) =>
      async (args: { module?: string; days?: number }) =>
        runTool(async () => ok(await client.request("/api/v1/models/usage", { params: args }))),
  },
];
