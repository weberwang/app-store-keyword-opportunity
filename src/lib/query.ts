import { normalizeTerm, toCsvList, toNumber } from "./text.js";
import type { KeywordResult, QueryFilters, Snapshot } from "../types.js";

interface ResolvedFilters {
  q: string;
  country: string;
  category: string;
  providerSources: string[];
  include: string[];
  requireAll: string[];
  exclude: string[];
  minSourceConfidence: number | undefined;
  maxFreshnessHours: number | undefined;
  includeEstimated: boolean | undefined;
  minOpportunity: number | undefined;
  maxCompetition: number | undefined;
  minDemand: number | undefined;
  minMonetization: number | undefined;
  minMarketGap: number | undefined;
  minHighValueScore: number | undefined;
  minDemandDurability: number | undefined;
  minSupplyWeakness: number | undefined;
  minMonetizationEvidence: number | undefined;
  minEntryFeasibility: number | undefined;
  minEvidenceConfidence: number | undefined;
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
    providerSources: toCsvList(input.providerSources),
    include: toCsvList(input.include),
    requireAll: toCsvList(input.requireAll),
    exclude: toCsvList(input.exclude),
    minSourceConfidence: toNumber(input.minSourceConfidence),
    maxFreshnessHours: toNumber(input.maxFreshnessHours),
    includeEstimated: input.includeEstimated,
    minOpportunity: toNumber(input.minOpportunity),
    maxCompetition: toNumber(input.maxCompetition),
    minDemand: toNumber(input.minDemand),
    minMonetization: toNumber(input.minMonetization),
    minMarketGap: toNumber(input.minMarketGap),
    minHighValueScore: toNumber(input.minHighValueScore),
    minDemandDurability: toNumber(input.minDemandDurability),
    minSupplyWeakness: toNumber(input.minSupplyWeakness),
    minMonetizationEvidence: toNumber(input.minMonetizationEvidence),
    minEntryFeasibility: toNumber(input.minEntryFeasibility),
    minEvidenceConfidence: toNumber(input.minEvidenceConfidence),
    maxTitleMatches: toNumber(input.maxTitleMatches),
    maxMedianReviews: toNumber(input.maxMedianReviews),
    limit: toNumber(input.limit) ?? 20,
    sortBy: input.sortBy || "opportunity",
  };
}

function sortKeywords(items: KeywordResult[], sortBy: string): KeywordResult[] {
  const copy = [...items];
  if (sortBy === "high-value") {
    return copy.sort(
      (l, r) =>
        (r.highValueSummary?.overallScore || 0) -
        (l.highValueSummary?.overallScore || 0),
    );
  }
  if (sortBy === "competition")
    return copy.sort((l, r) => l.competitionScore - r.competitionScore);
  if (sortBy === "demand")
    return copy.sort((l, r) => r.demandScore - l.demandScore);
  return copy.sort((l, r) => r.opportunityScore - l.opportunityScore);
}

function scoreQueryMatch(item: KeywordResult, query: string): number {
  const normalizedQuery = normalizeTerm(query);
  if (!normalizedQuery) {
    return 0;
  }

  const term = normalizeTerm(item.term);
  const seedText = normalizeTerm(item.seeds.join(" "));
  const titleText = normalizeTerm(item.topApps.map((app) => app.title).join(" "));

  if (term === normalizedQuery) {
    return 100;
  }
  if (term.includes(normalizedQuery)) {
    return 90;
  }
  if (seedText.includes(normalizedQuery)) {
    return 70;
  }
  if (titleText.includes(normalizedQuery)) {
    return 55;
  }

  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const termTokens = new Set(term.split(" "));
  const overlap = queryTokens.filter((token) => termTokens.has(token)).length;
  return overlap ? overlap * 20 : 0;
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
    items = items
      .map((item) => ({ item, score: scoreQueryMatch(item, filters.q) }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)
      .map((entry) => entry.item);
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

  if (filters.providerSources.length) {
    items = items.filter((item) => {
      const sources = item.signalCoverage?.availableSources || [];
      return filters.providerSources.some((source) => sources.includes(source as any));
    });
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
  if (filters.minSourceConfidence !== undefined) {
    items = items.filter(
      (item) => Number(item.signalCoverage?.averageConfidence || 0) >= filters.minSourceConfidence!,
    );
  }
  if (filters.maxFreshnessHours !== undefined) {
    items = items.filter((item) => {
      const freshness = Math.min(...(item.marketSignals || []).map((signal) => signal.metadata.freshnessHours ?? Infinity));
      return Number.isFinite(freshness) ? freshness <= filters.maxFreshnessHours! : false;
    });
  }
  if (filters.includeEstimated !== undefined && !filters.includeEstimated) {
    items = items.filter((item) => !item.signalCoverage?.includesEstimatedValues);
  }
  if (filters.minHighValueScore !== undefined) {
    items = items.filter(
      (item) => Number(item.highValueSummary?.overallScore || 0) >= filters.minHighValueScore!,
    );
  }
  if (filters.minDemandDurability !== undefined) {
    items = items.filter(
      (item) => Number(item.highValueSummary?.dimensions.demandDurability.score || 0) >= filters.minDemandDurability!,
    );
  }
  if (filters.minSupplyWeakness !== undefined) {
    items = items.filter(
      (item) => Number(item.highValueSummary?.dimensions.supplyWeakness.score || 0) >= filters.minSupplyWeakness!,
    );
  }
  if (filters.minMonetizationEvidence !== undefined) {
    items = items.filter(
      (item) => Number(item.highValueSummary?.dimensions.monetizationEvidence.score || 0) >= filters.minMonetizationEvidence!,
    );
  }
  if (filters.minEntryFeasibility !== undefined) {
    items = items.filter(
      (item) => Number(item.highValueSummary?.dimensions.entryFeasibility.score || 0) >= filters.minEntryFeasibility!,
    );
  }
  if (filters.minEvidenceConfidence !== undefined) {
    items = items.filter(
      (item) => Number(item.highValueSummary?.dimensions.evidenceConfidence.score || 0) >= filters.minEvidenceConfidence!,
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
