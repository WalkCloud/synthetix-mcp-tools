import { Readable, Transform } from "node:stream";
import { Config } from "./config.js";
import { AppError, NETWORK_ERROR_MESSAGE } from "./errors.js";

/** Application JSON envelope: { success, data } | { success:false, error, code? }. */
interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export type Expect = "json" | "binary" | "sse";

export interface RequestOptions {
  method?: string;
  /** JSON-serializable request body. */
  body?: unknown;
  /** URL query parameters. */
  params?: Record<string, string | number | boolean | undefined>;
  /** Extra headers. */
  headers?: Record<string, string>;
  /** Response handling mode. Defaults to "json". */
  expect?: Expect;
  /** Override the default request timeout (ms). */
  timeoutMs?: number;
}

export interface BinaryResult {
  buffer: Buffer;
  contentType: string;
  filename: string | null;
}

/** A single parsed SSE event from the Synthetix streaming endpoints. */
export interface SseEvent {
  type: string;
  [key: string]: unknown;
}

/**
 * Thin HTTP client for the Synthetix REST API.
 *
 * Injects the Bearer API key and locale on every request, and normalises the
 * three response shapes the app produces: JSON envelope, binary downloads
 * (export), and SSE streams (section generate/compare).
 */
export class HttpClient {
  constructor(private readonly config: Config) {}

  /**
   * Perform a request and return the parsed result according to `expect`.
   * - json: returns the envelope `data`; throws AppError on success=false.
   * - binary: returns { buffer, contentType, filename }.
   * - sse: returns an async generator yielding parsed events until `done`/`error`.
   */
  async request<T = unknown>(path: string, options?: RequestOptions): Promise<T>;
  async request(path: string, options: RequestOptions & { expect: "binary" }): Promise<BinaryResult>;
  async request(path: string, options: RequestOptions & { expect: "sse" }): Promise<AsyncGenerator<SseEvent>>;
  async request<T = unknown>(path: string, options: RequestOptions = {}): Promise<unknown> {
    const url = this.buildUrl(path, options.params);
    const expect = options.expect ?? "json";
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
      "x-locale": this.config.locale,
      ...options.headers,
    };
    if (options.body !== undefined && expect !== "binary") {
      headers["Content-Type"] = "application/json";
    }
    const init: RequestInit = {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? this.serializeBody(options.body, expect) : undefined,
    };

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch {
      throw new AppError("network", NETWORK_ERROR_MESSAGE);
    }

    if (expect === "binary") return this.handleBinary(response);
    if (expect === "sse") return this.handleSse(response);
    return this.handleJson<T>(response);
  }

  private buildUrl(path: string, params?: RequestOptions["params"]): string {
    const url = new URL(this.config.baseUrl + (path.startsWith("/") ? path : `/${path}`));
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private serializeBody(body: unknown, expect: Expect): BodyInit {
    // FormData (multipart upload) passes through untouched.
    if (expect === "binary" || body instanceof FormData) return body as BodyInit;
    return JSON.stringify(body);
  }

  private async handleJson<T>(response: Response): Promise<T> {
    let envelope: Envelope<T>;
    try {
      envelope = (await response.json()) as Envelope<T>;
    } catch {
      throw new AppError("network", `应用返回了非 JSON 响应(HTTP ${response.status})。`);
    }
    if (!envelope.success) {
      throw new AppError(envelope.code ?? "error", envelope.error ?? "请求失败");
    }
    return envelope.data as T;
  }

  private async handleBinary(response: Response): Promise<BinaryResult> {
    if (!response.ok) {
      // Export error responses are still JSON envelopes.
      const text = await response.text().catch(() => "");
      throw new AppError("exportFailed", text || `HTTP ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    const disposition = response.headers.get("content-disposition") ?? "";
    const filenameMatch = /filename="?([^";]+)"?/.exec(disposition);
    return { buffer, contentType, filename: filenameMatch ? filenameMatch[1] : null };
  }

  private async *handleSse(response: Response): AsyncGenerator<SseEvent> {
    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => "");
      throw new AppError("generationFailed", text || `HTTP ${response.status}`);
    }
    const lines = Readable.fromWeb(response.body as import("stream/web").ReadableStream)
      .setEncoding("utf-8")
      .pipe(splitLines());
    for await (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      let event: SseEvent;
      try {
        event = JSON.parse(payload) as SseEvent;
      } catch {
        continue; // ignore malformed lines
      }
      if (event.type === "error") {
        throw new AppError("generationFailed", String(event.error ?? "流式生成失败"));
      }
      yield event;
      if (event.type === "done") return;
    }
  }
}

/**
 * Consume an SSE stream to completion, accumulating chunk contents for the
 * given source key ("content" for generate, "source"+"content" for compare).
 */
export async function consumeGenerateStream(
  stream: AsyncGenerator<SseEvent>
): Promise<{ content: string; references: unknown[] }> {
  let content = "";
  const references: unknown[] = [];
  for await (const event of stream) {
    if (event.type === "chunk" && typeof event.content === "string") {
      content += event.content;
    } else if (event.type === "references" && Array.isArray(event.references)) {
      references.push(...event.references);
    }
    // "done" ends the generator; "error" throws inside handleSse.
  }
  return { content, references };
}

/** Accumulate an A/B comparison stream into contentA/contentB. */
export async function consumeCompareStream(
  stream: AsyncGenerator<SseEvent>
): Promise<{ contentA: string; contentB: string; references: unknown[] }> {
  let contentA = "";
  let contentB = "";
  const references: unknown[] = [];
  for await (const event of stream) {
    if (event.type === "chunk" && typeof event.content === "string") {
      if (event.source === "a") contentA += event.content;
      else if (event.source === "b") contentB += event.content;
    } else if (event.type === "references" && Array.isArray(event.references)) {
      references.push(...event.references);
    }
  }
  return { contentA, contentB, references };
}

// ─── internal: line splitter for SSE parsing ────────────────────────────────

function splitLines(): Transform {
  let tail = "";
  return new Transform({
    objectMode: true,
    transform(chunk: Buffer, _encoding, callback) {
      tail += chunk.toString("utf-8");
      const parts = tail.split("\n");
      tail = parts.pop() ?? "";
      for (const part of parts) this.push(part);
      callback();
    },
    flush(callback) {
      if (tail) this.push(tail);
      callback();
    },
  });
}
