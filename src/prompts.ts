import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Predefined prompt templates (surfaced as slash commands in clients like
 * Claude Code). These encode the Synthetix writing SOP so users don't have to
 * describe the workflow themselves — they just fill in the topic.
 *
 * Each prompt returns structured messages that guide the agent through the
 * right tool-call sequence, rather than relying on the agent to invent it.
 */

interface PromptMessage {
  role: "user" | "assistant";
  content: { type: "text"; text: string };
}

function user(text: string): PromptMessage {
  return { role: "user", content: { type: "text", text } };
}

export function registerPrompts(server: McpServer): void {
  // ── 长文写作冲刺:从主题到成稿的完整流水线 ──────────────────────────
  server.prompt(
    "longform-writing",
    "长文写作冲刺:从主题到成稿的完整流水线。先梳理需求→生成大纲→逐章写作→(可选)双模型对比→导出。适合一次性产出报告/方案/长文。",
    {
      topic: z.string().describe("文章主题或选题,如'中小企业数字化转型方案'"),
      length: z
        .enum(["short", "standard", "full"])
        .optional()
        .describe("篇幅:short(简版 2-3千字)/standard(标准 5-8千字)/full(完整 1万字+)。默认 standard"),
      source_doc_ids: z
        .string()
        .optional()
        .describe("作为素材的知识库文档 ID(逗号分隔),可选。会先检索这些资料"),
      dual_model: z
        .boolean()
        .optional()
        .describe("是否每章用双模型对比写作。默认 false(单模型)"),
    },
    ({ topic, length = "standard", source_doc_ids, dual_model = false }) => {
      const steps: string[] = [];
      steps.push(`我要写一篇关于「${topic}」的长文,篇幅要求:${lengthHint(length)}。`);

      if (source_doc_ids) {
        steps.push(
          `首先,用 search_knowledge 工具检索这些知识库资料(文档 ID:${source_doc_ids})中与主题相关的内容,` +
            "确认资料覆盖度。如果资料不足,告诉我缺什么。"
        );
      }

      steps.push(
        "然后创建一个头脑风暴会话(create_brainstorm_session),通过 brainstorm_message 与我多轮对话梳理需求。" +
          "注意:在确认篇幅前 AI 不会推进,请如实回答篇幅问题。" +
          "需求梳理完毕后,用 generate_outline 生成大纲(异步任务,用 get_task_status 轮询直到完成)," +
          "再用 get_outline 把大纲展示给我确认。我可以让你修改大纲节点。"
      );

      steps.push(
        "我确认大纲后,用 create_draft(sessionId) 创建草稿(无需重传大纲)。"
      );

      if (dual_model) {
        steps.push(
          "对每个章节,用 compare_section 用两个不同模型对比生成,把两版都展示给我让我选择," +
            "然后用 confirm_section(selectedSource) 确认。"
        );
      } else {
        steps.push(
          "对每个章节用 generate_section 生成(完成后章节是 reviewing 状态),逐章展示给我," +
            "我认可后用 confirm_section 确认。也可以让我用 edit_section 修改。"
        );
      }
      steps.push(
        "全部章节确认后(都变成 locked 状态),用 assemble_preview 组装全文预览给我看,最后用 export_draft 导出。"
      );
      steps.push("每一步都和我确认,不要一口气跑完。现在开始第一步。");

      return { messages: [user(steps.join("\n\n"))] };
    }
  );

  // ── 快速大纲:仅生成大纲,不写作 ──────────────────────────────────
  server.prompt(
    "quick-outline",
    "快速大纲:基于主题直接生成一份结构化大纲(不进入写作)。适合先看结构再决定是否开写。",
    {
      topic: z.string().describe("文章主题"),
      archetype: z
        .enum([
          "technical_solution",
          "proposal",
          "bidding",
          "consulting",
          "planning",
          "assessment",
          "operations",
          "general",
        ])
        .optional()
        .describe("文档原型:技术方案/建议书/投标/咨询报告/规划/评估/运维/通用。默认 general"),
    },
    ({ topic, archetype = "general" }) => ({
      messages: [
        user(
          `我要为「${topic}」生成一份大纲(文档类型:${archetype})。` +
            "创建头脑风暴会话,通过 brainstorm_message 快速梳理核心需求(主题/受众/篇幅/范围)," +
            "然后用 generate_outline 生成大纲并展示给我。先别写作。"
        ),
      ],
    })
  );

  // ── 双模型审稿:对已有草稿逐章对比优化 ────────────────────────────
  server.prompt(
    "dual-model-review",
    "双模型审稿:对一篇已有草稿,逐章用两个模型重新生成并对比,选出更优版本。适合打磨成稿质量。",
    {
      draft_id: z.string().describe("要审稿的草稿 ID"),
      model_a: z.string().optional().describe("模型 A 的 configId(留空用默认 writing 模型)"),
      model_b: z.string().optional().describe("模型 B 的 configId(留空自动选取与 A 不同的模型)"),
    },
    ({ draft_id, model_a, model_b }) => ({
      messages: [
        user(
          `我要对草稿 ${draft_id} 做双模型审稿。先用 get_draft 查看草稿和所有章节。` +
            "然后对每个章节用 compare_section" +
            (model_a ? `(modelAConfigId=${model_a}` : "(用默认模型 A") +
            (model_b ? `, modelBConfigId=${model_b}` : ",模型 B 自动选取") +
            ") 重新生成两版,把两版都展示给我让我选,用 confirm_section(selectedSource) 确认我选的那版。" +
            "逐章进行,每章都让我选。全部完成后用 assemble_preview 给我看全文。"
        ),
      ],
    })
  );
}

function lengthHint(length: string): string {
  switch (length) {
    case "short":
      return "简版(2-3千字)";
    case "full":
      return "完整版(1万字以上)";
    default:
      return "标准版(5-8千字)";
  }
}
