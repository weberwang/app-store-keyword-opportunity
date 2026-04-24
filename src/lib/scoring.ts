import { normalizeTerm } from "./text.js";
import type {
  AppStoreApp,
  CompetitionMetrics,
  HighValueDimension,
  HighValueDimensionAssessment,
  HighValueOpportunitySummary,
  MarketSignalMetric,
  NormalizedMarketSignal,
  SignalCoverageSummary,
} from "../types.js";

interface DemandScoreInput {
  bestRank?: number;
  suggestionCount?: number;
  resultCount?: number;
  reviewSignal?: number;
}

interface OpportunityScoreInput {
  demandScore: number;
  competitionScore: number;
  relevanceScore: number;
  monetizationScore?: number;
  marketGapScore?: number;
  buildabilityScore?: number;
}

interface HighValueEvidenceInput {
  title: string;
  demand: number;
  competition: number;
  marketGap: number;
  monetizationPotential: number;
  implementationFeasibility: number;
  risk: number;
  trendMomentum?: number | null;
  supplyFreshness?: number | null;
  replacementPressure?: number | null;
  painIntensity?: number | null;
  signalCoverage?: SignalCoverageSummary;
  signals?: NormalizedMarketSignal[];
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function average(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageNullable(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((value): value is number => typeof value === "number" && !Number.isNaN(value));
  if (!valid.length) {
    return null;
  }
  return average(valid);
}

function median(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function scale(value: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0 || max <= 0) {
    return 0;
  }
  return Math.min(value / max, 1);
}

function describeBand(score: number, positiveHigh = true): string {
  if (positiveHigh) {
    if (score >= 75) {
      return "strong";
    }
    if (score >= 55) {
      return "moderate";
    }
    return "weak";
  }
  if (score <= 25) {
    return "low";
  }
  if (score <= 45) {
    return "contained";
  }
  return "elevated";
}

function metricAverage(
  signals: NormalizedMarketSignal[] | undefined,
  metrics: MarketSignalMetric[],
): number | null {
  if (!signals?.length) {
    return null;
  }
  const values = signals
    .filter((signal) => metrics.includes(signal.metric))
    .map((signal) => signal.value);
  return values.length ? average(values) : null;
}

function createHighValueDimension(
  score: number | null,
  summary: string,
  signalMetrics: MarketSignalMetric[],
  evidence: string[],
): HighValueDimensionAssessment {
  return {
    score: clampScore(score ?? 50),
    summary,
    evidence,
    signalMetrics,
    missing: score === null,
  };
}

function recommendationForScore(score: number, evidenceConfidence: number): string {
  if (score >= 78 && evidenceConfidence >= 65) {
    return "Strong self-build candidate with validated demand and buildable whitespace.";
  }
  if (score >= 60) {
    return "Promising candidate, but validate the weakest assumption before committing build effort.";
  }
  if (score >= 45) {
    return "Interesting signal, but not yet a convincing self-build bet without more evidence.";
  }
  return "Not yet a compelling self-build opportunity at the current evidence quality.";
}

export function buildHighValueOpportunitySummary(
  input: HighValueEvidenceInput,
): HighValueOpportunitySummary {
  const demandDurabilityScore = averageNullable([
    metricAverage(input.signals, ["demand-durability", "trend-momentum"]),
    input.demand,
    input.trendMomentum,
    input.painIntensity === undefined || input.painIntensity === null ? null : Math.min(input.painIntensity + 6, 100),
  ]);
  const supplyWeaknessScore = averageNullable([
    metricAverage(input.signals, ["supply-staleness", "complaint-intensity", "switching-intent"]),
    input.marketGap,
    100 - input.competition,
    input.supplyFreshness === undefined || input.supplyFreshness === null ? null : 100 - input.supplyFreshness,
    input.replacementPressure,
  ]);
  const monetizationEvidenceScore = averageNullable([
    metricAverage(input.signals, ["paid-share", "price-point", "revenue-estimate", "download-estimate"]),
    input.monetizationPotential,
  ]);
  const entryFeasibilityScore = averageNullable([
    metricAverage(input.signals, ["entry-feasibility"]),
    input.implementationFeasibility,
    100 - input.competition,
    input.marketGap,
  ]);
  const missingSourcePenalty = (input.signalCoverage?.missingSources.length || 0) * 8;
  const evidenceConfidenceScore = averageNullable([
    input.signalCoverage?.averageConfidence,
    100 - Math.max(0, input.risk - 20),
    input.signals?.length ? 70 : 52,
  ]);
  const adjustedEvidenceConfidence = clampScore((evidenceConfidenceScore ?? 50) - missingSourcePenalty);

  const dimensions: Record<HighValueDimension, HighValueDimensionAssessment> = {
    demandDurability: createHighValueDimension(
      demandDurabilityScore,
      `Demand durability looks ${describeBand(clampScore(demandDurabilityScore ?? 50))} for ${input.title}.`,
      ["demand-durability", "trend-momentum", "review-volume"],
      [
        `Base demand score ${clampScore(input.demand)}`,
        `Momentum signal ${clampScore(input.trendMomentum ?? input.demand)}`,
      ],
    ),
    supplyWeakness: createHighValueDimension(
      supplyWeaknessScore,
      `Supply weakness is ${describeBand(clampScore(supplyWeaknessScore ?? 50))}, indicating how buildable the whitespace is.`,
      ["supply-staleness", "complaint-intensity", "switching-intent", "competition-density"],
      [
        `Competition inverse ${clampScore(100 - input.competition)}`,
        `Market gap ${clampScore(input.marketGap)}`,
      ],
    ),
    monetizationEvidence: createHighValueDimension(
      monetizationEvidenceScore,
      `Monetization evidence is ${describeBand(clampScore(monetizationEvidenceScore ?? 50))} for a self-build product.`,
      ["paid-share", "price-point", "revenue-estimate", "download-estimate"],
      [`Monetization potential ${clampScore(input.monetizationPotential)}`],
    ),
    entryFeasibility: createHighValueDimension(
      entryFeasibilityScore,
      `Entry feasibility is ${describeBand(clampScore(entryFeasibilityScore ?? 50))} after balancing execution cost and incumbent pressure.`,
      ["entry-feasibility", "competition-density"],
      [
        `Implementation feasibility ${clampScore(input.implementationFeasibility)}`,
        `Competition inverse ${clampScore(100 - input.competition)}`,
      ],
    ),
    evidenceConfidence: createHighValueDimension(
      adjustedEvidenceConfidence,
      `Evidence confidence is ${describeBand(adjustedEvidenceConfidence)} and drops when provider coverage is incomplete.`,
      [],
      [
        `Average provider confidence ${clampScore(input.signalCoverage?.averageConfidence ?? 52)}`,
        `Missing sources ${input.signalCoverage?.missingSources.join(", ") || "none"}`,
      ],
    ),
  };

  const overallScore = clampScore(
    dimensions.demandDurability.score * 0.28 +
      dimensions.supplyWeakness.score * 0.23 +
      dimensions.monetizationEvidence.score * 0.2 +
      dimensions.entryFeasibility.score * 0.17 +
      dimensions.evidenceConfidence.score * 0.12,
  );

  const blockers: string[] = [];
  if (dimensions.demandDurability.score < 50) {
    blockers.push("Demand durability is not yet strong enough to justify a new build.");
  }
  if (dimensions.monetizationEvidence.score < 45) {
    blockers.push("Monetization proof is weak relative to the required build effort.");
  }
  if (dimensions.entryFeasibility.score < 45) {
    blockers.push("Entry feasibility is constrained by competition or execution cost.");
  }
  if (dimensions.evidenceConfidence.score < 50) {
    blockers.push("Evidence confidence is reduced because signal coverage is incomplete.");
  }

  const strongestSignals = Object.values(dimensions)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((dimension) => dimension.summary);

  return {
    overallScore,
    dimensions,
    buildRecommendation: recommendationForScore(overallScore, dimensions.evidenceConfidence.score),
    strongestSignals,
    blockers,
    missingEvidenceSources: input.signalCoverage?.missingSources || [],
  };
}

export function computeDemandScore(input: DemandScoreInput): number {
  const rankScore = input.bestRank ? clampScore(100 - (input.bestRank - 1) * 4) : 40;
  const resultScore = clampScore(scale(input.resultCount || 0, 50) * 100);
  const suggestionScore = clampScore(Math.min(input.suggestionCount || 0, 10) * 10);
  const reviewScore = clampScore(scale(Math.log10((input.reviewSignal || 0) + 1), 5) * 100);

  return clampScore(rankScore * 0.35 + resultScore * 0.25 + suggestionScore * 0.15 + reviewScore * 0.25);
}

export function computeCompetitionScore(
  term: string,
  apps: AppStoreApp[],
): { competitionScore: number; metrics: CompetitionMetrics } {
  const normalizedTerm = normalizeTerm(term);
  const exactTitleMatches = apps.filter((app) => normalizeTerm(app.title) === normalizedTerm).length;
  const partialTitleMatches = apps.filter((app) => normalizeTerm(app.title).includes(normalizedTerm)).length;
  const reviewCounts = apps.map((app) => app.reviews || 0);
  const medianReviewCount = Math.round(median(reviewCounts));
  const avgRating = Number(average(apps.map((app) => app.score || 0)).toFixed(2));
  const paidRatio = apps.length
    ? Math.round((apps.filter((app) => !app.free).length / apps.length) * 100)
    : 0;

  const titlePressure = clampScore(exactTitleMatches * 20 + partialTitleMatches * 8);
  const reviewPressure = clampScore(scale(Math.log10(medianReviewCount + 1), 5) * 100);
  const qualityPressure = clampScore(scale(avgRating, 5) * 100);
  const competitionScore = clampScore(titlePressure * 0.45 + reviewPressure * 0.35 + qualityPressure * 0.2);

  return {
    competitionScore,
    metrics: {
      exactTitleMatches,
      partialTitleMatches,
      medianReviewCount,
      avgRating,
      paidRatio,
    },
  };
}

export function computeRelevanceScore(term: string, apps: AppStoreApp[]): number {
  const normalizedTerm = normalizeTerm(term);
  const termTokens = normalizedTerm.split(" ").filter(Boolean);
  if (!apps.length || !termTokens.length) {
    return 0;
  }

  const topApps = apps.slice(0, 5);
  const scores = topApps.map((app) => {
    const title = normalizeTerm(app.title);
    const description = normalizeTerm(app.description || "");
    const genre = normalizeTerm(app.genre || "");
    const titleExact = title === normalizedTerm ? 100 : title.includes(normalizedTerm) ? 90 : 0;
    const titleOverlap = termTokens.filter((token) => title.includes(token)).length / termTokens.length;
    const descriptionOverlap = termTokens.filter((token) => description.includes(token)).length / termTokens.length;
    const genreOverlap = termTokens.filter((token) => genre.includes(token)).length / termTokens.length;
    return clampScore(
      titleExact * 0.45 + titleOverlap * 35 + descriptionOverlap * 15 + genreOverlap * 5,
    );
  });

  return clampScore(average(scores));
}

export function computeMonetizationScore(apps: AppStoreApp[]): number {
  if (!apps.length) {
    return 0;
  }

  const paidRatio = apps.filter((app) => !app.free).length / apps.length;
  const averagePrice = average(apps.filter((app) => app.price > 0).map((app) => app.price));
  const averageRating = average(apps.map((app) => app.score || 0));
  return clampScore(paidRatio * 55 + scale(averagePrice, 20) * 25 + scale(averageRating, 5) * 20);
}

export function computeMarketGapScore(
  competitionScore: number,
  metrics: CompetitionMetrics,
): number {
  const ratingGap = clampScore((4.7 - metrics.avgRating) * 35);
  const reviewDepth = clampScore(scale(Math.log10(metrics.medianReviewCount + 1), 5) * 100);
  const whitespace = 100 - competitionScore;
  return clampScore(whitespace * 0.55 + ratingGap * 0.3 + reviewDepth * 0.15);
}

export function computeOpportunityScore(input: OpportunityScoreInput): number {
  const baseScore = clampScore(
    input.demandScore * 0.3 +
      (100 - input.competitionScore) * 0.22 +
      input.relevanceScore * 0.18 +
      (input.monetizationScore || 0) * 0.15 +
      (input.marketGapScore || 0) * 0.15,
  );
  if (input.buildabilityScore === undefined) {
    return baseScore;
  }
  return clampScore(baseScore * 0.6 + input.buildabilityScore * 0.4);
}