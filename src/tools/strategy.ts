import path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { env } from "../lib/env.js";
import { buildProductStrategy } from "../lib/insight.js";
import { readSnapshot } from "../lib/json-store.js";
import { err, ok } from "./common.js";

export function registerStrategyTools(server: McpServer): void {
  server.tool(
    "build_strategy",
    "从本地快照文件生成产品策略报告：机会词分桶、变现模式推荐、定位建议和分阶段行动路线图。",
    {
      file: z
        .string()
        .optional()
        .describe("快照 JSON 文件路径，默认使用 DATA_FILE 或 OUTPUT_DIR/keywords.json"),
      min_opportunity: z
        .number()
        .default(30)
        .describe("只分析机会分高于此值的关键词"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .default(100)
        .describe("最多分析多少个关键词"),
    },
    async ({ file, min_opportunity, limit }) => {
      try {
        const snapshotFile = path.resolve(file ?? env.dataFile);
        const snapshot = await readSnapshot(snapshotFile);
        const keywords = (snapshot.keywords || [])
          .filter((kw) => kw.opportunityScore >= min_opportunity)
          .slice(0, limit);

        if (!keywords.length) {
          return err(
            `快照中没有机会分 >= ${min_opportunity} 的关键词，请降低阈值或先运行 search_keywords 采集数据。`,
          );
        }

        const strategy = buildProductStrategy(keywords);
        if (!strategy) return err("数据不足，无法生成策略报告。");

        return ok({
          snapshotFile,
          meta: {
            ...strategy.meta,
            dataDate: snapshot.meta?.generatedAt?.slice(0, 10) || "未知",
            country: snapshot.meta?.country,
            keywordsAnalyzed: keywords.length,
          },
          opportunities: {
            qualityGap: strategy.opportunities.qualityGap.map((k) => ({
              term: k.term,
              opportunityScore: k.opportunityScore,
              insight: k.insight?.summary,
            })),
            staleMarket: strategy.opportunities.staleMarket.map((k) => ({
              term: k.term,
              opportunityScore: k.opportunityScore,
            })),
            blueOcean: strategy.opportunities.blueOcean.map((k) => ({
              term: k.term,
              opportunityScore: k.opportunityScore,
            })),
            dominated: strategy.opportunities.dominated.map((k) => ({
              term: k.term,
              opportunityScore: k.opportunityScore,
            })),
          },
          monetization: {
            model: strategy.monetizationModel,
            reason: strategy.monetizationReason,
          },
          positioning: strategy.positioningHints,
          roadmap: strategy.roadmap,
        });
      } catch (e: any) {
        return err(e.message);
      }
    },
  );
}