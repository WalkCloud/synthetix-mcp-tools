import { z } from "zod";
import { AppError, describeAppError } from "./errors.js";
import type { HttpClient } from "./client.js";

/** Standard MCP tool result shape. */
export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

/**
 * A tool definition. `schema` is a zod raw shape (Record of zod schemas), so
 * the array across modules widens to a single type instead of a per-tool union.
 * The handler is loosely typed (args: any) because each tool destructures its
 * own named fields; runtime validation is done by the SDK via the schema.
 */
export interface ToolDef {
  name: string;
  description: string;
  schema: Record<string, z.ZodTypeAny>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (client: HttpClient) => (args: any) => Promise<any>;
}

/** Wrap a successful value as a text MCP result (JSON-stringified). */
export function ok(value: unknown, extraHint?: string): ToolResult {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text: extraHint ? `${text}\n\n${extraHint}` : text }] };
}

/** Convert a thrown error into an actionable isError MCP result. */
export function fail(error: unknown): ToolResult {
  if (error instanceof AppError) {
    return {
      isError: true,
      content: [{ type: "text", text: describeAppError(error.code, error.message) }],
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { isError: true, content: [{ type: "text", text: message }] };
}

/**
 * Run a tool handler body and map its outcome to a MCP result. Catches all
 * errors so the agent always receives a recoverable hint instead of a protocol
 * error.
 */
export async function runTool(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (error) {
    return fail(error);
  }
}

// ─── Shared input schemas ───────────────────────────────────────────────────

export const queryModeSchema = z
  .enum(["local", "global", "hybrid", "mix", "naive", "bypass"])
  .describe("检索模式:mix(默认混合)/local(局部)/global(全局)/hybrid(混合)/naive(朴素)/bypass(跳过LLM)");
export const indexModeSchema = z.enum(["basic", "graph"]).describe("索引模式:basic(基础,仅向量)/graph(图谱,需LLM+dim≥1536)");
export const exportFormatSchema = z
  .enum(["markdown", "pdf", "docx"])
  .describe("导出格式:markdown/pdf/docx");

/** ProcessingOptions forwarded to the document reprocess endpoint. */
export const processingOptionsSchema = z.object({
  indexMode: indexModeSchema.optional(),
  wikiEnabled: z.boolean().optional().describe("是否启用 Wiki 合成(默认 true)"),
  forceReconnect: z.boolean().optional().describe("忽略转换缓存,从源文件重新转换"),
});
