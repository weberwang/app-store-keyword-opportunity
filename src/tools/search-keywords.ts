import path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { collectKeywordSnapshot } from "../lib/collector.js";
import { writeSnapshot } from "../lib/json-store.js";
import { env } from "../lib/env.js";
import { err, ok } from "./common.js";
import { marketSignalEntityKinds, marketSignalMetrics } from "../types.js";

const importedProviderSignalSchema = z.object({
  entityKind: z.enum(marketSignalEntityKinds),
  entityId: z.string().min(1),
  entityLabel: z.string().optional(),
  metric: z.enum(marketSignalMetrics),
  value: z.number(),
  territory: z.string().optional(),
  collectedAt: z.string().optional(),
  confidence: z.number().min(0).max(100).optional(),
  isEstimated: z.boolean().optional(),
  rawMetricKey: z.string().optional(),
  rawValue: z.union([z.number(), z.string(), z.null()]).optional(),
  summary: z.string().optional(),
});

const importedProviderSnapshotSchema = z.object({
  providerId: z.string().min(1),
  generatedAt: z.string().optional(),
  signals: z.array(importedProviderSignalSchema),
});

export function registerSearchKeywordTools(server: McpServer): void {
  server.tool(
    "search_keywords",
    "采集 App Store 关键词机会数据，并将快照保存到本地文件。输入种子词，返回机会分/竞争分/需求分排名与头部竞品信息。",
    {
      seeds: z
        .string()
        .describe("种子关键词，逗号分隔，例：habit tracker,daily planner"),
      country: z
        .string()
        .default("us")
        .describe("App Store 国家代码，如 us/cn/jp/gb/de"),
      language: z
        .string()
        .default("en-us")
        .describe("搜索语言，如 en-us/zh-cn/ja"),
      genre_id: z
        .string()
        .default("")
        .describe("iTunes 品类 ID，留空表示不限（6013=健康，6020=效率等）"),
      aso_snapshot_file: z
        .string()
        .optional()
        .describe("外部 ASO provider 快照文件路径，内容需为归一化 market signals JSON"),
      aso_snapshot: importedProviderSnapshotSchema
        .optional()
        .describe("直接传入的外部 ASO provider 快照对象，和 aso_snapshot_file 二选一即可"),
      suggestions_limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .default(10)
        .describe("每个种子词最多拉取几条联想词"),
      results_limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .default(50)
        .describe("每个词搜索多少条 App 用于打分"),
      detail_limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .default(5)
        .describe("每个词拉取几条 App 详情"),
      concurrency: z.number().int().min(1).max(8).default(3).describe("并发数"),
      output_path: z
        .string()
        .optional()
        .describe("快照输出文件路径，默认使用 DATA_FILE 或 OUTPUT_DIR/keywords.json"),
    },
    async ({
      seeds,
      country,
      language,
      genre_id,
      aso_snapshot_file,
      aso_snapshot,
      suggestions_limit,
      results_limit,
      detail_limit,
      concurrency,
      output_path,
    }) => {
      try {
        const snapshot = await collectKeywordSnapshot({
          seeds,
          country,
          language,
          genreId: genre_id,
          asoSnapshotFile: aso_snapshot_file ? path.resolve(aso_snapshot_file) : env.asoSnapshotFile,
          asoSnapshot: aso_snapshot,
          suggestionsLimit: suggestions_limit,
          resultsLimit: results_limit,
          detailLimit: detail_limit,
          concurrency,
        });

        const snapshotFile = path.resolve(output_path ?? env.dataFile);
        await writeSnapshot(snapshotFile, snapshot);

        const top = snapshot.keywords.slice(0, 30).map((kw) => ({
          term: kw.term,
          opportunityScore: kw.opportunityScore,
          highValueScore: kw.highValueSummary?.overallScore,
          demandScore: kw.demandScore,
          competitionScore: kw.competitionScore,
          monetizationScore: kw.monetizationScore,
          marketGapScore: kw.marketGapScore,
          relevanceScore: kw.relevanceScore,
          country: kw.country,
          signalCoverage: kw.signalCoverage,
          highValueSummary: kw.highValueSummary
            ? {
                overallScore: kw.highValueSummary.overallScore,
                buildRecommendation: kw.highValueSummary.buildRecommendation,
                strongestSignals: kw.highValueSummary.strongestSignals,
                blockers: kw.highValueSummary.blockers,
              }
            : null,
          topApps: kw.topApps.slice(0, 3).map((a) => ({
            title: a.title,
            developer: a.developer,
            score: a.score,
            reviews: a.reviews,
            free: a.free,
          })),
          insight: {
            hints: kw.insight?.hints || [],
            summary: kw.insight?.summary,
          },
        }));

        return ok({
          meta: snapshot.meta,
          snapshotFile,
          topOpportunities: top,
          totalKeywords: snapshot.keywords.length,
        });
      } catch (e: any) {
        return err(e.message);
      }
    },
  );
}