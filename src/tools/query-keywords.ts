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
      min_opportunity: z.number().optional().describe("最低机会分（0-100）"),
      max_competition: z.number().optional().describe("最高竞争分（0-100）"),
      min_demand: z.number().optional().describe("最低需求分（0-100）"),
      include: z.string().default("").describe("关键词必须包含的词（逗号分隔）"),
      exclude: z.string().default("").describe("关键词必须排除的词（逗号分隔）"),
      sort_by: z
        .enum(["opportunity", "competition", "demand"])
        .default("opportunity"),
      limit: z.number().int().min(1).max(100).default(20),
    },
    async ({
      file,
      q,
      min_opportunity,
      max_competition,
      min_demand,
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
          minOpportunity: min_opportunity,
          maxCompetition: max_competition,
          minDemand: min_demand,
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
            demandScore: kw.demandScore,
            competitionScore: kw.competitionScore,
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