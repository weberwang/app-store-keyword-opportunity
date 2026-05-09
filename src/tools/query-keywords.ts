import path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { env } from "../lib/env.js";
import { readSnapshot } from "../lib/json-store.js";
import { queryKeywords } from "../lib/query.js";
import { err, ok } from "./common.js";

export function registerQueryKeywordTools(server: McpServer): void {
  server.tool(
    "query_keywords",
    "从本地快照文件查询、筛选关键词。支持模糊搜索和多维度过滤。",
    {
      file: z
        .string()
        .optional()
        .describe("快照 JSON 文件路径，默认使用 DATA_FILE 或 OUTPUT_DIR/keywords.json"),
      q: z
        .string()
        .default("")
        .describe("模糊搜索词（匹配 term/种子词/App 标题）"),
      provider_sources: z.string().default("").describe("按来源过滤，如 apple-public,aso-provider"),
      min_source_confidence: z.number().optional().describe("最低信号来源平均置信度（0-100）"),
      max_freshness_hours: z.number().optional().describe("最大信号新鲜度小时数"),
      include_estimated: z.boolean().optional().describe("是否保留包含估算值的结果，默认保留"),
      min_opportunity: z.number().optional().describe("最低机会分（0-100）"),
      min_high_value_score: z.number().optional().describe("最低高价值选题分（0-100）"),
      max_competition: z.number().optional().describe("最高竞争分（0-100）"),
      min_demand: z.number().optional().describe("最低需求分（0-100）"),
      min_monetization: z.number().optional().describe("最低变现潜力分（0-100）"),
      min_market_gap: z.number().optional().describe("最低市场缺口分（0-100）"),
      min_demand_durability: z.number().optional().describe("最低需求持续性分（0-100）"),
      min_supply_weakness: z.number().optional().describe("最低供给弱点分（0-100）"),
      min_monetization_evidence: z.number().optional().describe("最低商业化证据分（0-100）"),
      min_entry_feasibility: z.number().optional().describe("最低切入可行性分（0-100）"),
      min_evidence_confidence: z.number().optional().describe("最低证据可信度分（0-100）"),
      include: z.string().default("").describe("关键词必须包含的词（逗号分隔）"),
      exclude: z.string().default("").describe("关键词必须排除的词（逗号分隔）"),
      sort_by: z
        .enum(["opportunity", "competition", "demand", "high-value"])
        .default("opportunity"),
      limit: z.number().int().min(1).max(100).default(20),
    },
    async ({
      file,
      q,
      provider_sources,
      min_source_confidence,
      max_freshness_hours,
      include_estimated,
      min_opportunity,
      min_high_value_score,
      max_competition,
      min_demand,
      min_monetization,
      min_market_gap,
      min_demand_durability,
      min_supply_weakness,
      min_monetization_evidence,
      min_entry_feasibility,
      min_evidence_confidence,
      include,
      exclude,
      sort_by,
      limit,
    }) => {
      try {
        const snapshotFile = path.resolve(file ?? env.dataFile);
        const snapshot = await readSnapshot(snapshotFile);
        const results = queryKeywords(snapshot, {
          q,
          providerSources: provider_sources,
          minSourceConfidence: min_source_confidence,
          maxFreshnessHours: max_freshness_hours,
          includeEstimated: include_estimated,
          minOpportunity: min_opportunity,
          minHighValueScore: min_high_value_score,
          maxCompetition: max_competition,
          minDemand: min_demand,
          minMonetization: min_monetization,
          minMarketGap: min_market_gap,
          minDemandDurability: min_demand_durability,
          minSupplyWeakness: min_supply_weakness,
          minMonetizationEvidence: min_monetization_evidence,
          minEntryFeasibility: min_entry_feasibility,
          minEvidenceConfidence: min_evidence_confidence,
          include,
          exclude,
          sortBy: sort_by,
          limit,
        });

        return ok({
          snapshotFile,
          count: results.length,
          totalKeywords: snapshot.keywords.length,
          keywords: results.map((kw) => ({
            term: kw.term,
            opportunityScore: kw.opportunityScore,
            highValueScore: kw.highValueSummary?.overallScore,
            demandScore: kw.demandScore,
            competitionScore: kw.competitionScore,
            monetizationScore: kw.monetizationScore,
            marketGapScore: kw.marketGapScore,
            signalCoverage: kw.signalCoverage,
            highValueSummary: kw.highValueSummary,
            country: kw.country,
            seeds: kw.seeds,
            topApp: kw.topApps[0]
              ? { title: kw.topApps[0].title, score: kw.topApps[0].score }
              : null,
          })),
        });
      } catch (e: any) {
        return err(e.message);
      }
    },
  );
}