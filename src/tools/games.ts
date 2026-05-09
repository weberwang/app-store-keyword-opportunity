import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { analyzeGameHeat, analyzeGameKeywords, analyzeGameTrack } from "../lib/game-analysis.js";
import { defaultGameGenreId } from "../lib/game-utils.js";
import { writeSnapshot } from "../lib/json-store.js";
import path from "path";
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

export function registerGameTools(server: McpServer): void {
  server.tool(
    "search_game_keywords",
    "按游戏赛道采集关键词机会，并返回更贴近游戏市场的关键词结构与 buildable whitespace 分析。",
    {
      seeds: z.string().describe("游戏种子关键词，逗号分隔，例：idle rpg,merge game,city builder"),
      country: z.string().default("us").describe("国家代码"),
      language: z.string().default("en-us").describe("搜索语言"),
      genre_id: z.string().default(defaultGameGenreId).describe("游戏品类 ID，默认 6014=Games"),
      aso_snapshot_file: z.string().optional().describe("外部 ASO provider 快照文件路径"),
      aso_snapshot: importedProviderSnapshotSchema.optional().describe("直接传入的外部 ASO provider 快照对象"),
      suggestions_limit: z.number().int().min(1).max(20).default(10),
      results_limit: z.number().int().min(1).max(200).default(50),
      detail_limit: z.number().int().min(1).max(20).default(5),
      concurrency: z.number().int().min(1).max(8).default(3),
      limit: z.number().int().min(1).max(50).default(20).describe("返回多少个头部关键词"),
      output_path: z.string().optional().describe("快照输出路径，默认写入 DATA_FILE 或 OUTPUT_DIR/keywords.json"),
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
      limit,
      output_path,
    }) => {
      try {
        const result = await analyzeGameKeywords({
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
          limit,
        });

        const snapshotFile = path.resolve(output_path ?? env.dataFile);
        await writeSnapshot(snapshotFile, result.snapshot);

        return ok({
          snapshotFile,
          meta: result.snapshot.meta,
          analysis: result.analysis,
        });
      } catch (e: any) {
        return err(e.message);
      }
    },
  );

  server.tool(
    "analyze_game_heat",
    "分析游戏赛道热度：输出热门子类型、上升中的头部游戏、厂商热度和标题热词。",
    {
      country: z.string().default("us").describe("国家代码，如 us/jp/kr/cn"),
      genre_id: z.string().default(defaultGameGenreId).describe("游戏品类 ID，默认 6014=Games"),
      limit: z.number().int().min(1).max(100).default(50).describe("每张榜单抓取多少条游戏"),
    },
    async ({ country, genre_id, limit }) => {
      try {
        const analysis = await analyzeGameHeat({
          country,
          genreId: genre_id,
          limit,
        });

        return ok(analysis);
      } catch (e: any) {
        return err(e.message);
      }
    },
  );

  server.tool(
    "analyze_game_track",
    "分析游戏赛道榜单结构、头部厂商集中度、live-ops 节奏、新游晋升情况和头部评论痛点。",
    {
      country: z.string().default("us").describe("国家代码，如 us/jp/kr/cn"),
      genre_id: z.string().default(defaultGameGenreId).describe("游戏品类 ID，默认 6014=Games"),
      limit: z.number().int().min(1).max(100).default(50).describe("每张榜单抓取多少条游戏"),
      include_reviews: z.boolean().default(true).describe("是否抓取头部游戏评论并提炼痛点/卖点"),
      review_pages: z.number().int().min(1).max(5).default(2).describe("每个头部游戏拉取多少页评论"),
      competitor_count: z.number().int().min(1).max(8).default(5).describe("最多分析多少个头部游戏的评论"),
    },
    async ({ country, genre_id, limit, include_reviews, review_pages, competitor_count }) => {
      try {
        const analysis = await analyzeGameTrack({
          country,
          genreId: genre_id,
          limit,
          includeReviews: include_reviews,
          reviewPages: review_pages,
          competitorCount: competitor_count,
        });

        return ok(analysis);
      } catch (e: any) {
        return err(e.message);
      }
    },
  );
}