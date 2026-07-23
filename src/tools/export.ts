import { z } from "zod";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { HttpClient, BinaryResult } from "../client.js";
import { ok, runTool, exportFormatSchema , type ToolDef } from "../schemas.js";

export const exportTools: ToolDef[] = [
  {
    name: "export_draft",
    description:
      "导出草稿为 markdown/pdf/docx。markdown 直接返回文本内容;" +
      "pdf 依赖 Playwright Chromium、docx 依赖 python-docx——若应用未安装这些依赖会返回错误,此时改用 markdown 格式。" +
      "只有 status 为 locked/summarized 的章节会被导出(需先 confirm 或用 generate_all_sections 自动锁定)。",
    schema: {
      draftId: z.string().describe("草稿 ID(由 create_draft 返回)"),
      format: exportFormatSchema,
      outputPath: z.string().optional().describe("自定义输出文件路径(仅 pdf/docx),留空则用系统临时目录"),
    },
    handler:
      (client: HttpClient) =>
      async ({ draftId, format, outputPath }: { draftId: string; format: "markdown" | "pdf" | "docx"; outputPath?: string }) =>
        runTool(async () => {
          const result = await client.request<BinaryResult>(`/api/v1/drafts/${draftId}/export`, {
            method: "POST",
            body: { format },
            expect: "binary",
          });
          // markdown: return text directly (no need to write a file)
          if (format === "markdown") {
            return ok({ format, content: result.buffer.toString("utf-8") });
          }
          const ext = format === "pdf" ? "pdf" : "docx";
          const target = outputPath ?? join(tmpdir(), `synthetix-export-${randomUUID()}.${ext}`);
          await writeFile(target, result.buffer);
          return ok({ format, filePath: target, filename: result.filename });
        }),
  },
];
