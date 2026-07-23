/**
 * MCP server configuration, sourced entirely from environment variables.
 *
 * These are provided by the agent client's MCP config (e.g. Claude Code's
 * .mcp.json `env` block, or Codex's config.toml). The server refuses to start
 * without an API key.
 */

export interface Config {
  /** Synthetix API access key (created in the app under Settings → API Keys). */
  apiKey: string;
  /** Base URL of the running Synthetix app. */
  baseUrl: string;
  /** Locale forwarded to the app (affects system messages, e.g. length prompts). */
  locale: string;
  /** Default per-request timeout in ms (covers long generation endpoints). */
  requestTimeoutMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const apiKey = env.SYNTHETIX_API_KEY?.trim();
  if (!apiKey) {
    // stdio servers must log to stderr; stdout is the protocol channel.
    console.error(
      "FATAL: SYNTHETIX_API_KEY is required. Create one in the Synthetix app under Settings → API Keys, " +
        "then pass it to this MCP server via its env config."
    );
    process.exit(1);
  }
  return {
    apiKey,
    baseUrl: (env.SYNTHETIX_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
    locale: env.SYNTHETIX_LOCALE ?? "zh-CN",
    requestTimeoutMs: Number(env.SYNTHETIX_REQUEST_TIMEOUT_MS) || 5 * 60 * 1000,
  };
}
