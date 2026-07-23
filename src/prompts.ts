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

  // ── 知识深读:对单个文档做结构化深度解读 ────────────────────────────
  server.prompt(
    "knowledge-deep-dive",
    "知识深读:对一篇已上传的文档做深度解读——检索核心要点、提炼结构化摘要、列出关键概念。适合研读/学习/资料消化。",
    {
      document_id: z.string().describe("已上传文档的 ID(从 list_documents 获取)"),
      focus: z
        .string()
        .optional()
        .describe("关注的侧重点,如'技术架构''商业逻辑''风险点'。留空则全面解读"),
    },
    ({ document_id, focus }) => ({
      messages: [
        user(
          `我要深度解读文档 ${document_id}` +
            (focus ? `(重点关注:${focus})` : "(全面解读)") +
            "。首先用 get_document 确认文档已就绪(status=ready);" +
            "然后用 search_knowledge 对该文档做多次检索,覆盖核心主题、关键概念、重要论点;" +
            "最后给我一份结构化解读:核心观点、关键概念清单、章节脉络、值得注意的细节。" +
            "不要写作,只做解读和提炼。"
        ),
      ],
    })
  );

  // ── 方案速成:基于原型从零生成结构化方案/投标书 ─────────────────────
  server.prompt(
    "proposal-from-scratch",
    "方案速成:基于文档原型(技术方案/投标/咨询/规划等)从零生成一份结构完整的长文。跳过冗长的头脑风暴,直奔结构化生成,适合有明确类型的成稿需求。",
    {
      topic: z.string().describe("方案主题,如'XX 系统集成项目实施方案'"),
      archetype: z
        .enum([
          "technical_solution",
          "proposal",
          "bidding",
          "consulting",
          "planning",
          "assessment",
          "operations",
        ])
        .describe("文档原型:technical_solution=技术方案/proposal=建议书/bidding=投标/consulting=咨询报告/planning=规划/assessment=评估/operations=运维"),
      length: z
        .enum(["short", "standard", "full"])
        .optional()
        .describe("篇幅:short(简版)/standard(标准)/full(完整)。默认 standard"),
      key_requirements: z
        .string()
        .optional()
        .describe("必须覆盖的关键要求(自然语言,如'含技术路线、实施计划、风险管控')"),
    },
    ({ topic, archetype, length = "standard", key_requirements }) => ({
      messages: [
        user(
          `我要写一份关于「${topic}」的文档,类型:${archetype},篇幅:${lengthHint(length)}。` +
            (key_requirements ? `必须覆盖:${key_requirements}。` : "") +
            "创建头脑风暴会话后,只用很少几轮 brainstorm_message 快速确认核心需求(受众/范围/篇幅)," +
            "不要过度提问。需求明确后立即用 generate_outline 生成大纲(异步,用 get_task_status 轮询)," +
            "get_outline 展示给我确认,然后用 create_draft 创建草稿,generate_all_sections 一次性生成全篇" +
            "(整篇生成会自动确认锁定),最后 export_draft 导出。追求高效成稿。"
        ),
      ],
    })
  );

  // ── 导出检查:核对草稿是否就绪可导出 ────────────────────────────────
  server.prompt(
    "export-readiness-check",
    "导出就绪检查:检查一篇草稿是否所有章节都已确认(locked),列出未完成章节,完成后可直接导出。适合导出前的最后一道核对。",
    {
      draft_id: z.string().describe("要检查的草稿 ID"),
    },
    ({ draft_id }) => ({
      messages: [
        user(
          `检查草稿 ${draft_id} 是否可以导出。用 get_draft 查看所有章节状态:` +
            "只有 locked/summarized 状态的章节会被导出。" +
            "如果所有章节都已确认,用 assemble_preview 组装全文预览给我看,并提示可以用 export_draft 导出;" +
            "如果有未确认的章节(reviewing/pending/failed),列出来告诉我哪些需要先 generate_section + confirm_section。" +
            "不要自动批量生成,只做检查和报告。"
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
