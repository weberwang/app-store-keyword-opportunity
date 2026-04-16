import { normalizeTerm, overlapRatio } from "./text.js";
import type {
  AppInfo,
  CompetitionMetrics,
  DemandInput,
  MarketInsightSummary,
  OpportunityInput,
} from "../types.js";

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function average(numbers: number[]): number {
  if (!numbers.length) return 0;
  return numbers.reduce((sum, item) => sum + item, 0) / numbers.length;
}

function median(numbers: number[]): number {
  if (!numbers.length) return 0;
  const sorted = [...numbers].sort((l, r) => l - r);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function logScale(value: number, maxReference: number): number {
  return clamp(Math.log1p(Math.max(0, value)) / Math.log1p(maxReference));
}

function titleContainsWholeKeyword(title: string, keyword: string): boolean {
  const t = normalizeTerm(title);
  const k = normalizeTerm(keyword);
  if (!t || !k) return false;
  return (
    t === k ||
    t.startsWith(`${k} `) ||
    t.endsWith(` ${k}`) ||
    t.includes(` ${k} `)
  );
}

export function computeRelevanceScore(term: string, seeds: string[]): number {
  const best = seeds.reduce(
    (cur, seed) => Math.max(cur, overlapRatio(term, seed)),
    0,
  );
  return round(best * 100);
}

export function computeDemandScore({
  bestRank,
  suggestionCount,
  resultCount,
}: DemandInput): number {
  const rankScore = bestRank ? clamp(1 - (bestRank - 1) / 7) : 0.15;
  const presenceScore = clamp(suggestionCount / 4);
  const searchCoverageScore = clamp(resultCount / 50);
  return round(
    100 * (0.6 * rankScore + 0.25 * presenceScore + 0.15 * searchCoverageScore),
  );
}

function adjustedReviews(app: AppInfo): number {
  const reviews = Number(app.reviews || 0);
  return app.free === false ? reviews * 2 : reviews;
}

export function computeCompetitionScore(
  keyword: string,
  topApps: AppInfo[],
): { competitionScore: number; metrics: CompetitionMetrics } {
  const reviewCounts = topApps
    .map(adjustedReviews)
    .filter((v) => Number.isFinite(v) && v >= 0);
  const top3ReviewSum = topApps
    .slice(0, 3)
    .reduce((sum, app) => sum + adjustedReviews(app), 0);
  const top3Ratings = topApps
    .slice(0, 3)
    .map((app) => Number(app.score || 0))
    .filter((v) => Number.isFinite(v) && v > 0);
  const totalReviewSum = topApps.reduce((sum, app) => sum + adjustedReviews(app), 0);
  const devCount = new Map<string, number>();
  for (const app of topApps) {
    const key = String(app.developerId || app.developer || "").trim();
    if (!key) continue;
    devCount.set(key, (devCount.get(key) || 0) + 1);
  }
  const topDeveloperApps = devCount.size
    ? Math.max(...Array.from(devCount.values()))
    : 0;
  const exactTitleMatches = topApps.filter((app) =>
    titleContainsWholeKeyword(app.title, keyword),
  ).length;

  const exactTitleDensity = exactTitleMatches / Math.max(1, topApps.length);
  const medianReviewCount = median(reviewCounts);
  const averageTopRating = average(top3Ratings);
  const medianReviewPressure = logScale(medianReviewCount, 50000);
  const top3ReviewPressure = logScale(top3ReviewSum, 150000);
  const topDeveloperShare = topApps.length
    ? topDeveloperApps / topApps.length
    : 0;
  const top3AppConcentration = totalReviewSum
    ? top3ReviewSum / totalReviewSum
    : 0;
  const concentrationPressure =
    0.6 * topDeveloperShare + 0.4 * top3AppConcentration;
  const ratingPressure = averageTopRating
    ? clamp((averageTopRating - 3.8) / 1.2)
    : 0;

  return {
    competitionScore: round(
      100 *
        (0.3 * exactTitleDensity +
          0.25 * medianReviewPressure +
          0.15 * top3ReviewPressure +
          0.1 * ratingPressure +
          0.2 * concentrationPressure),
    ),
    metrics: {
      exactTitleMatches,
      medianReviewCount: round(medianReviewCount),
      top3ReviewSum: round(top3ReviewSum),
      averageTopRating: round(averageTopRating),
      topDeveloperShare: round(topDeveloperShare * 100),
      top3AppConcentration: round(top3AppConcentration * 100),
    },
  };
}

export function computeMonetizationScore(topApps: AppInfo[]): number {
  if (!topApps.length) return 0;
  const paidApps = topApps.filter((app) => app.free === false);
  const paidRatio = paidApps.length / topApps.length;
  const avgPaidPrice = paidApps.length
    ? paidApps.reduce((sum, app) => sum + Number(app.price || 0), 0) /
      paidApps.length
    : 0;
  const avgScore = average(
    topApps
      .map((app) => Number(app.score || 0))
      .filter((v) => Number.isFinite(v) && v > 0),
  );
  const reviewMedian = median(
    topApps
      .map((app) => Number(app.reviews || 0))
      .filter((v) => Number.isFinite(v) && v >= 0),
  );

  // Paid ratio around 35% often indicates both willingness to pay and room for freemium growth.
  const paidMixSignal = clamp(1 - Math.abs(paidRatio - 0.35) / 0.35);
  const priceSignal = logScale(avgPaidPrice, 9.99);
  const qualitySignal = clamp(avgScore / 5);
  const reviewSignal = logScale(reviewMedian, 30000);

  return round(
    100 *
      (0.3 * paidMixSignal +
        0.25 * priceSignal +
        0.2 * qualitySignal +
        0.25 * reviewSignal),
  );
}

export function computeMarketGapScore(summary?: MarketInsightSummary): number {
  if (!summary || !summary.appCount) return 50;
  const appCount = Math.max(1, summary.appCount);
  const staleRatio = clamp(summary.staleCount / appCount);
  const fragmentation = clamp(summary.uniqueDevs / appCount);
  const qualityGapSignal = summary.qualityGap ? 1 : 0;
  const dominanceRelief = clamp(1 - summary.topDeveloperAppCount / appCount);

  return round(
    100 *
      (0.35 * qualityGapSignal +
        0.3 * staleRatio +
        0.2 * fragmentation +
        0.15 * dominanceRelief),
  );
}

export function computeOpportunityScore({
  demandScore,
  competitionScore,
  relevanceScore,
  monetizationScore = 50,
  marketGapScore = 50,
}: OpportunityInput): number {
  const supplyEase = 100 - competitionScore;
  const rawScore =
    0.3 * demandScore +
    0.25 * supplyEase +
    0.2 * monetizationScore +
    0.15 * marketGapScore +
    0.1 * relevanceScore;
  return round(clamp(rawScore / 100, 0, 1) * 100);
}
