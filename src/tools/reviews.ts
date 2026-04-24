import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { analyzeCompetitorReviews } from "../lib/review-analysis.js";
import { err, ok } from "./common.js";

export function registerReviewTools(server: McpServer): void {
  server.tool(
    "analyze_reviews",
    "分析竞品 App 用户评论，提取差评痛点词和好评卖点词。",
    {
      app_ids: z
        .string()
        .describe("App ID 列表，逗号分隔，例：1438388363,672401817"),
      country: z.string().default("us"),
      pages: z
        .number()
        .int()
        .min(1)
        .max(10)
        .default(3)
        .describe("每个 App 拉取多少页评论（每页约 50 条）"),
    },
    async ({ app_ids, country, pages }) => {
      try {
        const apps = app_ids
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((id) => ({ id, title: id }));

        if (!apps.length) return err("请提供至少一个 App ID");

        const result = await analyzeCompetitorReviews(apps, { country, pages });

        return ok({
          reviewsFetched: result.reviewsFetched,
          country,
          analyzedAt: result.analyzedAt,
          appSummaries: result.appSummaries,
          painPoints: result.painPoints.slice(0, 10),
          sellingPoints: result.sellingPoints.slice(0, 10),
          painExamples: result.painExamples,
          ratingHistogram: result.ratingHistogram,
          totalRatings: result.totalRatings,
        });
      } catch (e: any) {
        return err(e.message);
      }
    },
  );
}