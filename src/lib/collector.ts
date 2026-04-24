import { fetchCustomerReviews, lookupApps, searchApps } from "./app-store-client.js";
import { mapWithConcurrency } from "./async.js";
import {
  buildAppleKeywordSignals,
  buildKeywordCommunitySignals,
  buildKeywordTrendSignals,
  buildSnapshotSourceCoverage,
  mergeMarketSignals,
} from "./market-signals.js";
import { extractAsoProviderSignalsForKeyword, resolveAsoProviderSignalSnapshot } from "./provider-snapshot.js";
import {
  buildHighValueOpportunitySummary,
  computeCompetitionScore,
  computeDemandScore,
  computeMarketGapScore,
  computeMonetizationScore,
  computeOpportunityScore,
  computeRelevanceScore,
} from "./scoring.js";
import { fetchChart } from "./trends.js";
import { countFrequentTerms, normalizeTerm, tokenizeText, toCsvList } from "./text.js";
import type {
  AppReview,
  AppStoreApp,
  ImportedProviderSignalSnapshot,
  KeywordResult,
  NormalizedMarketSignal,
  Snapshot,
} from "../types.js";

interface CollectKeywordSnapshotInput {
  seeds: string;
  country?: string;
  language?: string;
  genreId?: string;
  asoSnapshotFile?: string;
  asoSnapshot?: ImportedProviderSignalSnapshot;
  suggestionsLimit?: number;
  resultsLimit?: number;
  detailLimit?: number;
  concurrency?: number;
}

const keywordReviewPages = 1;
const keywordReviewAppLimit = 3;
const keywordChartLimit = 50;

function mergeAppDetails(apps: AppStoreApp[], details: AppStoreApp[]): AppStoreApp[] {
  const byId = new Map(details.map((app) => [app.id, app]));
  return apps.map((app) => ({ ...app, ...(byId.get(app.id) || {}) }));
}

async function enrichApps(
  apps: AppStoreApp[],
  detailLimit: number,
  country: string,
  language: string,
): Promise<AppStoreApp[]> {
  const ids = apps.slice(0, detailLimit).map((app) => app.id);
  if (!ids.length) {
    return apps;
  }

  const details = await lookupApps(ids, { country, language });
  return mergeAppDetails(apps, details);
}

async function collectKeywordTrendApps(country: string, genreId: string) {
  const chartTypes = ["top-free", "new-apps"] as const;
  const chartSets = await Promise.all(
    chartTypes.map(async (chartType) => {
      try {
        return await fetchChart(country, chartType, keywordChartLimit, genreId);
      } catch {
        return [];
      }
    }),
  );
  return chartSets.flat();
}

async function collectKeywordCommunityReviewEntries(
  apps: AppStoreApp[],
  country: string,
  concurrency: number,
  reviewCache: Map<string, Promise<AppReview[]>>,
): Promise<Array<{ appId: string; title: string; reviews: AppReview[] }>> {
  return mapWithConcurrency(
    apps.slice(0, Math.min(keywordReviewAppLimit, apps.length)),
    Math.min(concurrency, keywordReviewAppLimit),
    async (app) => {
      const cacheKey = `${country}:${app.id}:${keywordReviewPages}`;
      let promise = reviewCache.get(cacheKey);
      if (!promise) {
        promise = fetchCustomerReviews(app.id, { country, pages: keywordReviewPages }).catch(() => []);
        reviewCache.set(cacheKey, promise);
      }
      return {
        appId: app.id,
        title: app.title,
        reviews: await promise,
      };
    },
  );
}

function deriveRelatedTerms(seed: string, apps: AppStoreApp[], suggestionsLimit: number): string[] {
  if (suggestionsLimit <= 1) {
    return [seed];
  }

  const seedTokens = tokenizeText(seed);
  const seedTokenSet = new Set(seedTokens);
  const remoteSignals = countFrequentTerms(
    apps.flatMap((app) => [app.title, app.genre]),
    {
      stopWords: seedTokenSet,
      limit: suggestionsLimit * 4,
    },
  );

  const seen = new Set<string>();
  const terms = [seed];
  seen.add(normalizeTerm(seed));

  for (const signal of remoteSignals) {
    const duplicatesSeedToken = [...seedTokenSet].some(
      (seedToken) =>
        signal.term === seedToken || signal.term.startsWith(seedToken) || seedToken.startsWith(signal.term),
    );
    if (seedTokenSet.has(signal.term) || duplicatesSeedToken) {
      continue;
    }
    const candidate = `${seed} ${signal.term}`.trim();
    const normalized = normalizeTerm(candidate);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    terms.push(candidate);
    seen.add(normalized);
    if (terms.length >= suggestionsLimit) {
      break;
    }
  }

  return terms;
}

function buildInsight(result: KeywordResult): KeywordResult["insight"] {
  const hints: string[] = [];
  if (result.competitionScore <= 45) {
    hints.push("标题重合低，搜索位相对不拥挤。");
  }
  if (result.marketGapScore >= 60) {
    hints.push("现有结果质量与用户规模之间存在可切入缺口。");
  }
  if (result.monetizationScore >= 55) {
    hints.push("付费/高质量产品占比说明商业化有验证基础。");
  }
  if (!hints.length) {
    hints.push("需求存在，但需要再验证是否值得切更窄的子意图。");
  }

  return {
    summary: `${result.term} 的机会分为 ${result.opportunityScore}，需求 ${result.demandScore}，竞争 ${result.competitionScore}。`,
    hints,
  };
}

function buildKeywordResult(
  term: string,
  seeds: string[],
  country: string,
  apps: AppStoreApp[],
  additionalSignals: Array<NormalizedMarketSignal[] | undefined> = [],
  expectedSources: Array<"apple-public" | "community" | "trend" | "aso-provider"> = ["apple-public", "community", "trend"],
): KeywordResult {
  const { signals, coverage } = mergeMarketSignals(
    [buildAppleKeywordSignals(term, country, apps), ...additionalSignals],
    { expectedSources },
  );
  const { competitionScore, metrics } = computeCompetitionScore(term, apps);
  const relevanceScore = computeRelevanceScore(term, apps);
  const demandScore = computeDemandScore({
    bestRank: 1,
    suggestionCount: Math.max(1, metrics.partialTitleMatches),
    resultCount: apps.length,
    reviewSignal: metrics.medianReviewCount,
  });
  const monetizationScore = computeMonetizationScore(apps);
  const marketGapScore = computeMarketGapScore(competitionScore, metrics);
  const highValueSummary = buildHighValueOpportunitySummary({
    title: term,
    demand: demandScore,
    competition: competitionScore,
    marketGap: marketGapScore,
    monetizationPotential: monetizationScore,
    implementationFeasibility: Math.max(35, Math.round((100 - competitionScore) * 0.45 + marketGapScore * 0.55)),
    risk: Math.round((competitionScore * 0.45) + ((100 - coverage.averageConfidence) * 0.35) + ((coverage.missingSources.length || 0) * 6)),
    trendMomentum: Math.round((demandScore * 0.6) + (relevanceScore * 0.4)),
    painIntensity: Math.min(100, Math.round((marketGapScore * 0.6) + ((100 - competitionScore) * 0.4))),
    signalCoverage: coverage,
    signals,
  });
  const opportunityScore = computeOpportunityScore({
    demandScore,
    competitionScore,
    relevanceScore,
    monetizationScore,
    marketGapScore,
    buildabilityScore: highValueSummary.overallScore,
  });

  const result: KeywordResult = {
    term,
    seeds,
    country,
    opportunityScore,
    demandScore,
    competitionScore,
    monetizationScore,
    marketGapScore,
    relevanceScore,
    topApps: apps.slice(0, 10),
    metrics: {
      ...metrics,
      resultCount: apps.length,
    },
    marketSignals: signals,
    signalCoverage: coverage,
    highValueSummary,
  };

  result.insight = buildInsight(result);
  return result;
}

export async function collectKeywordSnapshot(
  input: CollectKeywordSnapshotInput,
): Promise<Snapshot> {
  const country = (input.country || "us").trim().toLowerCase();
  const language = (input.language || "en-us").trim().toLowerCase();
  const genreId = input.genreId || "";
  const suggestionsLimit = Math.max(1, Math.min(input.suggestionsLimit || 10, 20));
  const resultsLimit = Math.max(1, Math.min(input.resultsLimit || 50, 200));
  const detailLimit = Math.max(1, Math.min(input.detailLimit || 5, 20));
  const concurrency = Math.max(1, Math.min(input.concurrency || 3, 8));
  const seeds = toCsvList(input.seeds);

  if (!seeds.length) {
    throw new Error("请提供至少一个种子关键词");
  }

  const asoSnapshot = await resolveAsoProviderSignalSnapshot({
    filePath: input.asoSnapshotFile,
    snapshot: input.asoSnapshot,
  });
  const expectedSources = ["apple-public", "community", "trend"] as Array<"apple-public" | "community" | "trend" | "aso-provider">;
  if (asoSnapshot.configured) {
    expectedSources.push("aso-provider");
  }

  const chartApps = await collectKeywordTrendApps(country, genreId);
  const reviewCache = new Map<string, Promise<AppReview[]>>();

  const seedApps = await mapWithConcurrency(seeds, concurrency, async (seed) => {
    const apps = await searchApps(seed, { country, language, limit: resultsLimit, genreId });
    return { seed, apps };
  });

  const termSeedMap = new Map<string, { term: string; seeds: Set<string> }>();
  for (const { seed, apps } of seedApps) {
    const relatedTerms = deriveRelatedTerms(seed, apps, suggestionsLimit);
    for (const term of relatedTerms) {
      const normalized = normalizeTerm(term);
      if (!termSeedMap.has(normalized)) {
        termSeedMap.set(normalized, { term, seeds: new Set<string>() });
      }
      termSeedMap.get(normalized)?.seeds.add(seed);
    }
  }

  const keywordEntries = await mapWithConcurrency(
    [...termSeedMap.values()],
    concurrency,
    async ({ term, seeds: supportingSeeds }) => {
      const apps = await searchApps(term, { country, language, limit: resultsLimit, genreId });
      if (!apps.length) {
        return null;
      }
      const enrichedApps = await enrichApps(apps, detailLimit, country, language);
      const reviewEntries = await collectKeywordCommunityReviewEntries(
        enrichedApps,
        country,
        concurrency,
        reviewCache,
      );
      const asoSignals = extractAsoProviderSignalsForKeyword(asoSnapshot.snapshot, {
        term,
        country,
        apps: enrichedApps,
      });
      const communitySignals = buildKeywordCommunitySignals(term, country, reviewEntries);
      const trendSignals = buildKeywordTrendSignals(term, country, enrichedApps, chartApps);
      return buildKeywordResult(
        term,
        [...supportingSeeds],
        country,
        enrichedApps,
        [communitySignals, trendSignals, asoSignals],
        expectedSources,
      );
    },
  );

  const keywords = keywordEntries
    .filter((entry): entry is KeywordResult => Boolean(entry))
    .sort((left, right) => {
      if (right.opportunityScore !== left.opportunityScore) {
        return right.opportunityScore - left.opportunityScore;
      }
      return right.demandScore - left.demandScore;
    });

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      country,
      language,
      seeds,
      totalKeywords: keywords.length,
      genreId: genreId || undefined,
      sourceCoverage: buildSnapshotSourceCoverage(keywords),
      providerWarnings: asoSnapshot.warnings.length ? asoSnapshot.warnings : undefined,
    },
    keywords,
  };
}