import { describe, it, expect, vi, beforeEach } from "vitest";
import { HttpClient } from "../src/client.js";
import type { Config } from "../src/config.js";
import { tasksTools } from "../src/tools/tasks.js";
import { writingTools } from "../src/tools/writing.js";
import { documentsTools } from "../src/tools/documents.js";

const config: Config = {
  apiKey: "sk-test",
  baseUrl: "http://localhost:3000",
  locale: "zh-CN",
  requestTimeoutMs: 5000,
};

function mockJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Find a tool by name in a module and invoke it with a mocked client. */
async function callTool(
  tools: typeof tasksTools,
  name: string,
  args: Record<string, unknown>,
  client: HttpClient
) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool ${name} not found`);
  return tool.handler(client)(args);
}

describe("get_task_status", () => {
  let client: HttpClient;
  beforeEach(() => {
    client = new HttpClient(config);
    vi.restoreAllMocks();
  });

  it("forwards to GET /api/v1/tasks/{id} and returns the data", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockJson({ success: true, data: { id: "t1", status: "running", progress: 42 } })
    );
    const result = await callTool(tasksTools, "get_task_status", { taskId: "t1" }, client);
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("running");
    expect(String(spy.mock.calls[0][0])).toContain("/api/v1/tasks/t1");
  });

  it("maps an app error to an actionable isError result", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockJson({ success: false, error: "bad", code: "notFound" }, 404)
    );
    const result = await callTool(tasksTools, "get_task_status", { taskId: "x" }, client);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/未知错误|bad/);
  });
});

describe("create_draft", () => {
  let client: HttpClient;
  beforeEach(() => {
    client = new HttpClient(config);
    vi.restoreAllMocks();
  });

  it("requires sessionId or outline", async () => {
    const result = await callTool(writingTools, "create_draft", {}, client);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("sessionId");
  });

  it("maps the draft response to draftId + sections with a next-step hint", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockJson({
        success: true,
        data: {
          id: "d1",
          title: "测试文档",
          sections: [
            { id: "s1", title: "第一章", index: 0, status: "pending" },
            { id: "s2", title: "第二章", index: 1, status: "pending" },
          ],
        },
      })
    );
    const result = await callTool(writingTools, "create_draft", { sessionId: "bs1" }, client);
    const text = result.content[0].text;
    expect(text).toContain('"draftId": "d1"');
    expect(text).toContain('"sectionId": "s1"');
    // The bridging hint should guide the agent to the next step.
    expect(text).toContain("generate_all_sections");
  });
});

describe("generate_all_sections", () => {
  let client: HttpClient;
  beforeEach(() => {
    client = new HttpClient(config);
    vi.restoreAllMocks();
  });

  it("returns taskId and the auto-confirm + polling hint", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockJson({ success: true, data: { taskId: "task-abc" } }, 201)
    );
    const result = await callTool(writingTools, "generate_all_sections", { draftId: "d1" }, client);
    const text = result.content[0].text;
    expect(text).toContain("task-abc");
    expect(text).toContain("get_task_status"); // polling guidance
    expect(text).toContain("自动锁定"); // auto-confirm hint
  });
});

describe("ingest_document validation", () => {
  let client: HttpClient;
  beforeEach(() => {
    client = new HttpClient(config);
    vi.restoreAllMocks();
  });

  it("rejects an unsupported extension before any network call", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const result = await callTool(documentsTools, "ingest_document", { path: "/tmp/file.xlsx" }, client);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("不支持的文件格式");
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects a missing file", async () => {
    const result = await callTool(documentsTools, "ingest_document", { path: "/tmp/nonexistent.pdf" }, client);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("文件不存在");
  });
});
