/**
 * Error model + mapping from the app's ErrorCode to actionable, model-facing
 * Chinese guidance. Tools convert these into MCP `isError: true` results so
 * the agent reads the hint and can recover (retry, reconfigure, ask the user).
 */

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** Synthetix API error codes (subset of src/lib/api-helpers.ts ErrorCode). */
type AppErrorCode =
  | "unauthorized"
  | "forbidden"
  | "notFound"
  | "draftNotFound"
  | "sectionNotFound"
  | "documentNotFound"
  | "modelNotConfigured"
  | "ragNotConfigured"
  | "generationFailed"
  | "exportFailed"
  | "invalidInput"
  | "conflict"
  | string;

/** Map an app error code + raw message to a concise, actionable hint for the agent. */
export function describeAppError(code: string | undefined, rawMessage: string): string {
  const c = (code ?? "") as AppErrorCode;
  switch (c) {
    case "unauthorized":
      return "API key 无效或已吊销。请在 Synthetix 应用「设置 → API 密钥」重新创建 key 并更新 MCP 配置。";
    case "modelNotConfigured":
      return "尚未配置所需模型。请在应用中配置对应的 chat 模型(用于对话/写作)后再试。";
    case "ragNotConfigured":
      return "尚未配置 embedding 或 LLM 模型,无法检索。请在应用「模型管理」中配置 embedding 和 LLM 模型后再试。";
    case "draftNotFound":
      return "草稿不存在或无权访问,请检查 draftId。";
    case "sectionNotFound":
      return "章节不存在或无权访问,请检查 sectionId。";
    case "documentNotFound":
      return "文档不存在或无权访问,请检查 documentId。";
    case "conflict":
      return `操作冲突:${rawMessage}`;
    case "exportFailed":
      return `导出失败:${rawMessage}。PDF 依赖 Playwright,DOCX 依赖 python-docx,markdown 不需要外部依赖。`;
    default:
      return rawMessage || c || "未知错误";
  }
}

/** A network/connection failure (not an app response). */
export const NETWORK_ERROR_MESSAGE =
  "无法连接 Synthetix 应用。请确认应用正在运行,且 SYNTHETIX_BASE_URL 配置正确。";
