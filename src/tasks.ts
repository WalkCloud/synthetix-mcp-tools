import { HttpClient } from "./client.js";

/** AsyncTask terminal states — stop polling once reached. */
export const TERMINAL_STATUSES = ["completed", "failed", "cancelled"] as const;

export interface TaskInfo {
  id: string;
  type: string;
  status: string;
  progress: number;
  result?: unknown;
  error?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Fetch a single task's status/result from GET /api/v1/tasks/{id}. */
export async function getTaskStatus(client: HttpClient, taskId: string): Promise<TaskInfo> {
  return client.request<TaskInfo>(`/api/v1/tasks/${taskId}`);
}

/** Cancel a task via POST /api/v1/tasks/{id}. */
export async function cancelTask(client: HttpClient, taskId: string): Promise<{ success: boolean; message?: string }> {
  return client.request(`/api/v1/tasks/${taskId}`, { method: "POST" });
}

/** Whether a task status is terminal (no further polling needed). */
export function isTerminal(status: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

/** Polling guidance text embedded in tool results so the agent knows the cadence. */
export const POLL_HINT =
  "返回的 taskId 表示一个异步任务。请用 get_task_status 工具轮询,建议间隔 10–30 秒," +
  "直到 status 为 completed/failed/cancelled。result 字段含实时进度(如当前正在生成的章节标题)。";
