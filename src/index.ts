#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { HttpClient } from "./client.js";
import { registerPrompts } from "./prompts.js";
import { tasksTools } from "./tools/tasks.js";
import { documentsTools, knowledgeTools } from "./tools/documents.js";
import { brainstormTools } from "./tools/brainstorm.js";
import { writingTools } from "./tools/writing.js";
import { exportTools } from "./tools/export.js";
import { modelsTools } from "./tools/models.js";

/** All tool modules, each a list of { name, description, schema, handler }. */
const allModules = [
  tasksTools,
  documentsTools,
  knowledgeTools,
  brainstormTools,
  writingTools,
  exportTools,
  modelsTools,
];

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new HttpClient(config);
  const server = new McpServer({
    name: "synthetix",
    version: "1.0.0",
  });

  let registered = 0;
  for (const mod of allModules) {
    for (const tool of mod) {
      // The handler factory receives the bound HttpClient and returns the
      // actual handler invoked by the SDK with validated args.
      const handler = tool.handler(client);
      server.tool(tool.name, tool.description, tool.schema, handler);
      registered++;
    }
  }

  // Predefined workflow prompts (surfaced as slash commands in clients).
  registerPrompts(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdio: logs go to stderr only — stdout is the protocol channel.
  console.error(`[synthetix-mcp] ${registered} tools + prompts registered · baseUrl=${config.baseUrl} · locale=${config.locale}`);
}

main().catch((error) => {
  console.error("[synthetix-mcp] 致命错误:", error);
  process.exit(1);
});
