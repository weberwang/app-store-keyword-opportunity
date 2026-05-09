import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { compareAcrossCountries } from "../lib/country-compare.js";
import { err, ok } from "./common.js";

export function registerCountryCompareTools(server: McpServer): void {
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
}