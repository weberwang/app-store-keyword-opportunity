#!/usr/bin/env node
/**
 * App Store 关键词机会分析 — MCP Server
 *
 * 工具列表：
 *   search_keywords      — 采集关键词机会（调用 iTunes + 联想词）
 *   query_keywords       — 过滤/查询快照文件中的关键词
 *   fetch_chart          — 拉取 iTunes 榜单 App
 *   analyze_chart        — 分析榜单热词与品类热度
 *   analyze_reviews      — 竞品评论情感分析（痛点 / 卖点）
 *   compare_countries    — 多国市场横向对比
 *   build_strategy       — 产品策略报告（从快照生成）
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { collectKeywordSnapshot } from "./lib/collector";
import { readSnapshot } from "./lib/json-store";
import { queryKeywords } from "./lib/query";
import { fetchChart, analyzeChartTrends } from "./lib/trends";
import { analyzeCompetitorReviews } from "./lib/review-analysis";
import { compareAcrossCountries } from "./lib/country-compare";
import { buildProductStrategy } from "./lib/insight";

// ─── helpers ─────────────────────────────────────────────────────────────────

function ok(data: unknown): { content: [{ type: "text"; text: string }] } {
  return {
    content: [{ type: "text", text: JSON.stringify(data, replacer, 2) }],
  };
}

function err(message: string): {
  content: [{ type: "text"; text: string }];
  isError: true;
} {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

/** JSON.stringify replacer: Map → plain object */
function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) {
    return Object.fromEntries(value);
  }
  return value;
}

// ─── server ──────────────────────────────────────────────────────────────────

const server = new McpServer(
  { name: "app-store-keyword-opportunity", version: "0.2.0" },
  {
    instructions:
      "App Store keyword research & opportunity analysis tool. " +
      "Use search_keywords to collect new data, then query_keywords / build_strategy to analyze results. " +
      "Use analyze_reviews to understand competitor pain points. " +
      "Use compare_countries to find the best market to launch in.",
  },
);

// ─── tool: search_keywords ───────────────────────────────────────────────────

server.tool(
  "search_keywords",
  "采集 App Store 关键词机会数据。输入种子词，返回机会分/竞争分/需求分排名，包含头部竞品信息。",
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
  },
  async ({
    seeds,
    country,
    language,
    genre_id,
    suggestions_limit,
    results_limit,
    detail_limit,
    concurrency,
  }) => {
    try {
      const snapshot = await collectKeywordSnapshot({
        seeds,
        country,
        language,
        genreId: genre_id,
        suggestionsLimit: suggestions_limit,
        resultsLimit: results_limit,
        detailLimit: detail_limit,
        concurrency,
      });

      const top = snapshot.keywords.slice(0, 30).map((kw) => ({
        term: kw.term,
        opportunityScore: kw.opportunityScore,
        demandScore: kw.demandScore,
        competitionScore: kw.competitionScore,
        relevanceScore: kw.relevanceScore,
        country: kw.country,
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
        topOpportunities: top,
        totalKeywords: snapshot.keywords.length,
      });
    } catch (e: any) {
      return err(e.message);
    }
  },
);

// ─── tool: query_keywords ────────────────────────────────────────────────────

server.tool(
  "query_keywords",
  "从本地快照文件查询、筛选关键词。支持模糊搜索和多维度过滤。",
  {
    file: z.string().describe("快照 JSON 文件的绝对路径"),
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
      const snapshot = await readSnapshot(file);
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
        count: results.length,
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

// ─── tool: fetch_chart ───────────────────────────────────────────────────────

server.tool(
  "fetch_chart",
  "拉取 iTunes App Store 实时榜单（免费榜/付费榜/新上架），返回名次、App 信息和品类。",
  {
    country: z.string().default("us").describe("国家代码"),
    chart_type: z
      .enum(["top-free", "top-paid", "new-apps"])
      .default("top-free"),
    limit: z.number().int().min(1).max(200).default(100),
    genre_id: z.string().default("").describe("品类 ID，留空表示全品类"),
  },
  async ({ country, chart_type, limit, genre_id }) => {
    try {
      const apps = await fetchChart(country, chart_type, limit, genre_id);
      return ok({ count: apps.length, country, chartType: chart_type, apps });
    } catch (e: any) {
      return err(e.message);
    }
  },
);

// ─── tool: analyze_chart ─────────────────────────────────────────────────────

server.tool(
  "analyze_chart",
  "分析 iTunes 榜单热词、品类热度和变现分布（直接拉取，无需快照文件）。",
  {
    country: z.string().default("us"),
    chart_type: z
      .enum(["top-free", "top-paid", "new-apps"])
      .default("top-free"),
    limit: z.number().int().min(1).max(200).default(100),
    genre_id: z.string().default(""),
  },
  async ({ country, chart_type, limit, genre_id }) => {
    try {
      const apps = await fetchChart(country, chart_type, limit, genre_id);
      const analysis = analyzeChartTrends(apps);
      return ok(analysis);
    } catch (e: any) {
      return err(e.message);
    }
  },
);

// ─── tool: analyze_reviews ───────────────────────────────────────────────────

server.tool(
  "analyze_reviews",
  "分析竞品 App 用户评论，提取差评痛点词（用户抱怨最多的问题）和好评卖点词（用户最认可的功能）。",
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
      .describe("每个 App 拉取多少页评论（每页 ~50 条）"),
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

// ─── tool: compare_countries ─────────────────────────────────────────────────

server.tool(
  "compare_countries",
  "对一组关键词在多个国家/地区并发打分，找出机会最大的市场。",
  {
    terms: z.string().describe("要对比的关键词，逗号分隔（建议不超过 5 个）"),
    countries: z
      .string()
      .default("us,cn,jp,gb,de")
      .describe("国家代码列表，逗号分隔"),
    genre_id: z.string().default("").describe("品类 ID"),
    concurrency: z.number().int().min(1).max(8).default(3),
  },
  async ({ terms, countries, genre_id, concurrency }) => {
    try {
      const termList = terms
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const countryList = countries
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (!termList.length) return err("请提供至少一个关键词");
      if (!countryList.length) return err("请提供至少一个国家代码");

      const result = await compareAcrossCountries(termList, countryList, {
        genreId: genre_id,
        concurrency,
      });

      return ok({
        analyzedAt: result.analyzedAt,
        bestMarket: result.countrySummaries[0] || null,
        countrySummaries: result.countrySummaries,
        termSummaries: result.termSummaries.map((ts) => ({
          term: ts.term,
          bestCountry: ts.bestCountry,
          bestOpportunityScore: ts.bestOpportunityScore,
          countryResults: ts.countryResults.map((r) => ({
            country: r.country,
            opportunityScore: r.opportunityScore,
            competitionScore: r.competitionScore,
            demandScore: r.demandScore,
            freeRatio: r.freeRatio,
            avgAppScore: r.avgAppScore,
            topApp: r.topApp,
          })),
        })),
      });
    } catch (e: any) {
      return err(e.message);
    }
  },
);

// ─── tool: build_strategy ────────────────────────────────────────────────────

server.tool(
  "build_strategy",
  "从本地快照文件生成产品策略报告：机会词分桶、变现模式推荐、定位建议和分阶段行动路线图。",
  {
    file: z.string().describe("快照 JSON 文件的绝对路径"),
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
      const snapshot = await readSnapshot(file);
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

// ─── start ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("App Store Keyword Opportunity MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
