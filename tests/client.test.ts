import { describe, it, expect, vi, beforeEach } from "vitest";
import { HttpClient } from "../src/client.js";
import { AppError } from "../src/errors.js";
import type { Config } from "../src/config.js";

const config: Config = {
  apiKey: "sk-synt-test-key",
  baseUrl: "http://localhost:3000",
  locale: "zh-CN",
  requestTimeoutMs: 5000,
};

function mockResponse(opts: { ok?: boolean; status?: number; body?: unknown; headers?: Record<string, string> }): Response {
  const status = opts.status ?? 200;
  const headers = new Headers(opts.headers);
  const isJson = headers.get("content-type")?.includes("application/json") ?? true;
  const body = opts.body;
  const init: ResponseInit = { status, headers };
  if (typeof body === "string" || body instanceof ArrayBuffer || body instanceof Uint8Array) {
    return new Response(body as BodyInit, init);
  }
  return new Response(isJson ? JSON.stringify(body) : (body as BodyInit), init);
}

describe("HttpClient", () => {
  let client: HttpClient;
  beforeEach(() => {
    client = new HttpClient(config);
    vi.restoreAllMocks();
  });

  it("injects Bearer token and x-locale on every request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockResponse({ body: { success: true, data: { ok: true } } })
    );
    await client.request("/api/v1/ping");
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("http://localhost:3000/api/v1/ping");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer sk-synt-test-key");
    expect((init?.headers as Record<string, string>)["x-locale"]).toBe("zh-CN");
  });

  it("unwraps the success/data envelope on json responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockResponse({ body: { success: true, data: { hello: "world" } } })
    );
    await expect(client.request("/x")).resolves.toEqual({ hello: "world" });
  });

  it("throws AppError with code+message on success=false", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockResponse({
        status: 400,
        body: { success: false, error: "Bad request", code: "invalidInput" },
      })
    );
    await expect(client.request("/x")).rejects.toMatchObject({
      name: "AppError",
      code: "invalidInput",
      message: "Bad request",
    });
  });

  it("maps a fetch rejection to a network AppError", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(client.request("/x")).rejects.toMatchObject({ code: "network" });
  });

  it("appends query params to the URL", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockResponse({ body: { success: true, data: [] } })
    );
    await client.request("/x", { params: { limit: 10, status: "ready", skip: undefined } });
    const url = String(spy.mock.calls[0][0]);
    expect(url).toContain("limit=10");
    expect(url).toContain("status=ready");
    expect(url).not.toContain("skip=");
  });

  it("parses binary responses into buffer + content-type + filename", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockResponse({
        body: bytes.buffer,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="report.pdf"',
        },
      })
    );
    const result = await client.request("/export", { expect: "binary" });
    expect(result.buffer).toEqual(Buffer.from(bytes));
    expect(result.contentType).toBe("application/pdf");
    expect(result.filename).toBe("report.pdf");
  });

  it("streams SSE events until done", async () => {
    const sseBody = [
      'data: {"type":"references","references":[{"id":"r1"}]}\n',
      'data: {"type":"chunk","content":"Hello "}\n',
      'data: {"type":"chunk","content":"World"}\n',
      'data: {"type":"done"}\n',
    ].join("\n");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockResponse({
        headers: { "content-type": "text/event-stream" },
        body: sseBody,
      })
    );
    const stream = await client.request("/generate", { expect: "sse" });
    const events: { type: string; [k: string]: unknown }[] = [];
    for await (const e of stream) events.push(e);
    expect(events.map((e) => e.type)).toEqual(["references", "chunk", "chunk", "done"]);
  });

  it("throws on an SSE error event", async () => {
    const sseBody = 'data: {"type":"error","error":"model failed"}\n';
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockResponse({ headers: { "content-type": "text/event-stream" }, body: sseBody })
    );
    const stream = await client.request("/generate", { expect: "sse" });
    await expect(async () => {
      for await (const _ of stream) void _;
    }).rejects.toMatchObject({ code: "generationFailed", message: "model failed" });
  });
});

describe("error description mapping", () => {
  it("maps known codes to actionable hints", async () => {
    const { describeAppError } = await import("../src/errors.js");
    expect(describeAppError("unauthorized", "x")).toContain("API key");
    expect(describeAppError("modelNotConfigured", "")).toContain("chat 模型");
    expect(describeAppError("ragNotConfigured", "")).toContain("embedding");
  });
});

void AppError; // ensure import is retained
