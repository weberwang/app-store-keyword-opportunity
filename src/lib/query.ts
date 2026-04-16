import Fuse from "fuse.js";
import { normalizeTerm, toCsvList, toNumber } from "./text.js";
import type { KeywordResult, QueryFilters, Snapshot } from "../types.js";

interface ResolvedFilters {
  q: string;
  country: string;
  category: string;
  include: string[];
  requireAll: string[];
  exclude: string[];
  minOpportunity: number | undefined;
  maxCompetition: number | undefined;
  minDemand: number | undefined;
  minMonetization: number | undefined;
  minMarketGap: number | undefined;
  maxTitleMatches: number | undefined;
  maxMedianReviews: number | undefined;
  limit: number;
  sortBy: string;
}

function buildFilters(input: QueryFilters = {}): ResolvedFilters {
  return {
    q: String(input.q || "").trim(),
    country: String(input.country || "").trim(),
    category: String(input.category || "").trim(),
    include: toCsvList(input.include),
    requireAll: toCsvList(input.requireAll),
    exclude: toCsvList(input.exclude),
    minOpportunity: toNumber(input.minOpportunity),
    maxCompetition: toNumber(input.maxCompetition),
    minDemand: toNumber(input.minDemand),
    minMonetization: toNumber(input.minMonetization),
    minMarketGap: toNumber(input.minMarketGap),
    maxTitleMatches: toNumber(input.maxTitleMatches),
    maxMedianReviews: toNumber(input.maxMedianReviews),
    limit: toNumber(input.limit) ?? 20,
    sortBy: input.sortBy || "opportunity",
  };
}

function sortKeywords(items: KeywordResult[], sortBy: string): KeywordResult[] {
  const copy = [...items];
  if (sortBy === "competition")
    return copy.sort((l, r) => l.competitionScore - r.competitionScore);
  if (sortBy === "demand")
    return copy.sort((l, r) => r.demandScore - l.demandScore);
  return copy.sort((l, r) => r.opportunityScore - l.opportunityScore);
}

export function queryKeywords(
  snapshot: Snapshot,
  rawFilters: QueryFilters = {},
): KeywordResult[] {
  const filters = buildFilters(rawFilters);
  let items: KeywordResult[] = Array.isArray(snapshot.keywords)
    ? [...snapshot.keywords]
    : [];

  if (filters.q) {
    const fuse = new Fuse(items, {
      includeScore: false,
      threshold: 0.35,
      ignoreLocation: true,
      keys: [
        { name: "term", weight: 0.7 },
        { name: "seeds", weight: 0.2 },
        { name: "topApps.title", weight: 0.1 },
      ],
    });
    items = fuse.search(filters.q).map((entry) => entry.item);
  }

  if (filters.country) {
    const tc = normalizeTerm(filters.country);
    items = items.filter((item) => normalizeTerm(item.country) === tc);
  }

  if (filters.category) {
    const cat = normalizeTerm(filters.category);
    items = items.filter((item) =>
      item.topApps.some((app) => normalizeTerm(app.genre).includes(cat)),
    );
  }

  if (filters.include.length) {
    items = items.filter((item) => {
      const term = normalizeTerm(item.term);
      return filters.include.some((e) => term.includes(normalizeTerm(e)));
    });
  }

  if (filters.requireAll.length) {
    items = items.filter((item) => {
      const term = normalizeTerm(item.term);
      return filters.requireAll.every((e) => term.includes(normalizeTerm(e)));
    });
  }

  if (filters.exclude.length) {
    items = items.filter((item) => {
      const term = normalizeTerm(item.term);
      return filters.exclude.every((r) => !term.includes(normalizeTerm(r)));
    });
  }

  if (filters.minOpportunity !== undefined) {
    items = items.filter(
      (item) => Number(item.opportunityScore) >= filters.minOpportunity!,
    );
  }
  if (filters.maxCompetition !== undefined) {
    items = items.filter(
      (item) => Number(item.competitionScore) <= filters.maxCompetition!,
    );
  }
  if (filters.minDemand !== undefined) {
    items = items.filter(
      (item) => Number(item.demandScore) >= filters.minDemand!,
    );
  }
  if (filters.minMonetization !== undefined) {
    items = items.filter(
      (item) => Number(item.monetizationScore || 0) >= filters.minMonetization!,
    );
  }
  if (filters.minMarketGap !== undefined) {
    items = items.filter(
      (item) => Number(item.marketGapScore || 0) >= filters.minMarketGap!,
    );
  }
  if (filters.maxTitleMatches !== undefined) {
    items = items.filter(
      (item) =>
        Number((item.metrics as any)?.exactTitleMatches || 0) <=
        filters.maxTitleMatches!,
    );
  }
  if (filters.maxMedianReviews !== undefined) {
    items = items.filter(
      (item) =>
        Number((item.metrics as any)?.medianReviewCount || 0) <=
        filters.maxMedianReviews!,
    );
  }

  return sortKeywords(items, filters.sortBy).slice(
    0,
    Math.max(1, filters.limit),
  );
}

export { buildFilters };
