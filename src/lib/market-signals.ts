import { normalizeTerm } from "./text.js";
import type {
  AppReview,
  AppStoreApp,
  ChartApp,
  MarketSignalSource,
  NormalizedMarketSignal,
  SignalCoverageSummary,
  SnapshotSourceSummary,
} from "../types.js";

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

function hoursSince(timestamp: string): number {
  const collectedAt = new Date(timestamp).getTime();
  if (!Number.isFinite(collectedAt)) {
    return 0;
  }
  return Math.max(0, (Date.now() - collectedAt) / (1000 * 60 * 60));
}

function daysSince(timestamp?: string): number | null {
  if (!timestamp) {
    return null;
  }
  const parsed = new Date(timestamp).getTime();
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.max(0, (Date.now() - parsed) / (1000 * 60 * 60 * 24));
}

function createSignal(
  entityKind: "keyword" | "app" | "topic",
  entityId: string,
  entityLabel: string,
  metric: NormalizedMarketSignal["metric"],
  value: number,
  options: {
    providerId: string;
    source: MarketSignalSource;
    territory: string;
    collectedAt: string;
    confidence: number;
    isEstimated?: boolean;
    rawMetricKey?: string;
    rawValue?: number | string | null;
    summary?: string;
  },
): NormalizedMarketSignal {
  return {
    entityKind,
    entityId,
    entityLabel,
    metric,
    value: clampScore(value),
    metadata: {
      providerId: options.providerId,
      source: options.source,
      territory: options.territory,
      collectedAt: options.collectedAt,
      freshnessHours: Number(hoursSince(options.collectedAt).toFixed(2)),
      confidence: clampScore(options.confidence),
      isEstimated: options.isEstimated ?? false,
      rawMetricKey: options.rawMetricKey,
      rawValue: options.rawValue,
      summary: options.summary,
    },
  };
}

export function buildAppleKeywordSignals(
  term: string,
  country: string,
  apps: AppStoreApp[],
): NormalizedMarketSignal[] {
  const normalizedTerm = normalizeTerm(term);
  const entityId = normalizedTerm || term;
  const collectedAt = new Date().toISOString();
  const exactTitleMatches = apps.filter((app) => normalizeTerm(app.title) === normalizedTerm).length;
  const partialTitleMatches = apps.filter((app) => normalizeTerm(app.title).includes(normalizedTerm)).length;
  const reviewCounts = apps.map((app) => app.reviews || 0);
  const medianReviewCount = median(reviewCounts);
  const avgRating = average(apps.map((app) => app.score || 0));
  const paidShare = apps.length ? (apps.filter((app) => !app.free).length / apps.length) * 100 : 0;
  const avgPrice = average(apps.filter((app) => app.price > 0).map((app) => app.price));
  const staleDays = average(
    apps
      .map((app) => daysSince(app.updatedAt))
      .filter((value): value is number => typeof value === "number"),
  );
  const establishedAppRatio = apps.length
    ? (apps.filter((app) => (app.reviews || 0) >= 100).length / apps.length) * 100
    : 0;
  const demandDurability = average([
    scale(Math.log10(medianReviewCount + 1), 5) * 100,
    establishedAppRatio,
  ]);
  const competitionDensity = clampScore(
    exactTitleMatches * 20 + partialTitleMatches * 8 + scale(Math.log10(medianReviewCount + 1), 5) * 35,
  );

  return [
    createSignal("keyword", entityId, term, "demand-volume", scale(apps.length, 50) * 100, {
      providerId: "apple-public-search",
      source: "apple-public",
      territory: country,
      collectedAt,
      confidence: 74,
      rawMetricKey: "resultCount",
      rawValue: apps.length,
      summary: "Derived from Apple public search result count.",
    }),
    createSignal("keyword", entityId, term, "demand-durability", demandDurability, {
      providerId: "apple-public-search",
      source: "apple-public",
      territory: country,
      collectedAt,
      confidence: 66,
      rawMetricKey: "medianReviewCount+establishedAppRatio",
      rawValue: `${medianReviewCount}|${Math.round(establishedAppRatio)}`,
      summary: "Estimated from review depth and the share of established apps in search results.",
      isEstimated: true,
    }),
    createSignal("keyword", entityId, term, "competition-density", competitionDensity, {
      providerId: "apple-public-search",
      source: "apple-public",
      territory: country,
      collectedAt,
      confidence: 71,
      rawMetricKey: "titleMatchPressure",
      rawValue: `${exactTitleMatches}|${partialTitleMatches}`,
      summary: "Derived from exact and partial title overlap in Apple public search results.",
    }),
    createSignal("keyword", entityId, term, "review-volume", scale(Math.log10(medianReviewCount + 1), 5) * 100, {
      providerId: "apple-public-search",
      source: "apple-public",
      territory: country,
      collectedAt,
      confidence: 72,
      rawMetricKey: "medianReviewCount",
      rawValue: Math.round(medianReviewCount),
      summary: "Derived from median review count across matching apps.",
    }),
    createSignal("keyword", entityId, term, "review-rating", scale(avgRating, 5) * 100, {
      providerId: "apple-public-search",
      source: "apple-public",
      territory: country,
      collectedAt,
      confidence: 78,
      rawMetricKey: "averageUserRating",
      rawValue: Number(avgRating.toFixed(2)),
      summary: "Derived from average rating across Apple public search results.",
    }),
    createSignal("keyword", entityId, term, "paid-share", paidShare, {
      providerId: "apple-public-search",
      source: "apple-public",
      territory: country,
      collectedAt,
      confidence: 76,
      rawMetricKey: "paidShare",
      rawValue: Number(paidShare.toFixed(2)),
      summary: "Derived from the free/paid mix in search results.",
    }),
    createSignal("keyword", entityId, term, "price-point", scale(avgPrice, 20) * 100, {
      providerId: "apple-public-search",
      source: "apple-public",
      territory: country,
      collectedAt,
      confidence: 62,
      rawMetricKey: "averagePaidPrice",
      rawValue: Number(avgPrice.toFixed(2)),
      summary: "Derived from paid app price points in public search results.",
      isEstimated: true,
    }),
    createSignal("keyword", entityId, term, "supply-staleness", scale(staleDays, 365) * 100, {
      providerId: "apple-public-search",
      source: "apple-public",
      territory: country,
      collectedAt,
      confidence: 60,
      rawMetricKey: "averageUpdateAgeDays",
      rawValue: Number(staleDays.toFixed(2)),
      summary: "Estimated from average time since the current-version release date.",
      isEstimated: true,
    }),
  ];
}

export function buildAppleChartSignals(
  country: string,
  chartType: ChartApp["chartType"],
  apps: ChartApp[],
): NormalizedMarketSignal[] {
  const collectedAt = new Date().toISOString();
  const entityId = `${country}:${chartType}`;
  const averageRank = average(apps.map((app) => app.rank));
  const averageRating = average(apps.map((app) => app.score || 0));
  const paidShare = apps.length ? (apps.filter((app) => !app.free).length / apps.length) * 100 : 0;
  const topTenRatio = apps.length ? (apps.filter((app) => app.rank <= 10).length / apps.length) * 100 : 0;

  return [
    createSignal("topic", entityId, chartType, "chart-momentum", 100 - scale(averageRank, 100) * 100, {
      providerId: "apple-public-chart",
      source: "apple-public",
      territory: country,
      collectedAt,
      confidence: 77,
      rawMetricKey: "averageRank",
      rawValue: Number(averageRank.toFixed(2)),
      summary: "Derived from average rank across the Apple public chart sample.",
    }),
    createSignal("topic", entityId, chartType, "demand-volume", scale(apps.length, 100) * 100, {
      providerId: "apple-public-chart",
      source: "apple-public",
      territory: country,
      collectedAt,
      confidence: 70,
      rawMetricKey: "chartSampleSize",
      rawValue: apps.length,
      summary: "Derived from the chart sample size requested from Apple public RSS.",
    }),
    createSignal("topic", entityId, chartType, "review-rating", scale(averageRating, 5) * 100, {
      providerId: "apple-public-chart",
      source: "apple-public",
      territory: country,
      collectedAt,
      confidence: 75,
      rawMetricKey: "averageUserRating",
      rawValue: Number(averageRating.toFixed(2)),
      summary: "Derived from average rating across chart apps.",
    }),
    createSignal("topic", entityId, chartType, "paid-share", paidShare, {
      providerId: "apple-public-chart",
      source: "apple-public",
      territory: country,
      collectedAt,
      confidence: 80,
      rawMetricKey: "paidShare",
      rawValue: Number(paidShare.toFixed(2)),
      summary: "Derived from the free/paid distribution within the chart sample.",
    }),
    createSignal("topic", entityId, chartType, "ranking-velocity", topTenRatio, {
      providerId: "apple-public-chart",
      source: "apple-public",
      territory: country,
      collectedAt,
      confidence: 68,
      rawMetricKey: "topTenRatio",
      rawValue: Number(topTenRatio.toFixed(2)),
      summary: "Derived from the share of apps occupying the top ten of the chart sample.",
      isEstimated: true,
    }),
  ];
}

export function buildKeywordTrendSignals(
  term: string,
  country: string,
  apps: AppStoreApp[],
  chartApps: ChartApp[],
): NormalizedMarketSignal[] {
  if (!apps.length || !chartApps.length) {
    return [];
  }

  const collectedAt = new Date().toISOString();
  const entityId = normalizeTerm(term) || term;
  const trackedApps = apps.slice(0, 10);
  const trackedIds = new Set(trackedApps.map((app) => app.id));
  const matches = chartApps.filter((app) => trackedIds.has(app.id));
  const trackedCount = Math.max(1, trackedApps.length);
  const overlapScore = clampScore((matches.length / trackedCount) * 100);
  const bestRank = matches.length ? Math.min(...matches.map((app) => app.rank)) : 0;
  const rankScore = matches.length ? clampScore(100 - (bestRank - 1) * 2) : 0;
  const newAppsMatches = matches.filter((app) => app.chartType === "new-apps").length;
  const newnessScore = clampScore((newAppsMatches / trackedCount) * 100);
  const chartMomentum = clampScore(overlapScore * 0.5 + rankScore * 0.5);
  const trendMomentum = clampScore(overlapScore * 0.45 + rankScore * 0.35 + newnessScore * 0.2);

  return [
    createSignal("keyword", entityId, term, "chart-momentum", chartMomentum, {
      providerId: "apple-public-chart-trend",
      source: "trend",
      territory: country,
      collectedAt,
      confidence: 72,
      rawMetricKey: "matchedChartApps+bestRank",
      rawValue: `${matches.length}|${bestRank || 0}`,
      summary: "Estimated from how many search results also appear in the current Apple charts.",
      isEstimated: true,
    }),
    createSignal("keyword", entityId, term, "trend-momentum", trendMomentum, {
      providerId: "apple-public-chart-trend",
      source: "trend",
      territory: country,
      collectedAt,
      confidence: 68,
      rawMetricKey: "chartOverlap+bestRank+newAppsOverlap",
      rawValue: `${matches.length}|${bestRank || 0}|${newAppsMatches}`,
      summary: "Estimated from chart overlap and new-app visibility for the keyword's top apps.",
      isEstimated: true,
    }),
  ];
}

export function buildKeywordCommunitySignals(
  term: string,
  country: string,
  reviewEntries: Array<{ appId: string; title: string; reviews: AppReview[] }>,
): NormalizedMarketSignal[] {
  const reviews = reviewEntries.flatMap((entry) => entry.reviews);
  if (!reviews.length) {
    return [];
  }

  const collectedAt = new Date().toISOString();
  const entityId = normalizeTerm(term) || term;
  const lowRatings = reviews.filter((review) => review.rating <= 3).length;
  const complaintIntensity = clampScore((lowRatings / reviews.length) * 100);
  const requestLikeReviews = reviews.filter((review) => {
    const normalized = normalizeTerm(`${review.title} ${review.content}`);
    return ["wish", "need", "please", "feature", "add", "want", "better", "fix", "sync", "export"].some((token) =>
      normalized.includes(token),
    );
  }).length;
  const communityIntent = clampScore(scale(Math.log10(reviews.length + 1), 3) * 100);
  const reviewerCoverage = clampScore(
    (reviewEntries.filter((entry) => entry.reviews.length > 0).length / Math.max(reviewEntries.length, 1)) * 100,
  );
  const switchingIntent = clampScore(
    complaintIntensity * 0.55 +
      scale(requestLikeReviews, Math.max(5, Math.round(reviews.length * 0.15))) * 25 +
      reviewerCoverage * 0.2,
  );

  return [
    createSignal("keyword", entityId, term, "community-intent", communityIntent, {
      providerId: "apple-public-review-community",
      source: "community",
      territory: country,
      collectedAt,
      confidence: 70,
      rawMetricKey: "reviewCount",
      rawValue: reviews.length,
      summary: "Derived from the amount of user-generated discussion in App Store reviews.",
      isEstimated: true,
    }),
    createSignal("keyword", entityId, term, "complaint-intensity", complaintIntensity, {
      providerId: "apple-public-review-community",
      source: "community",
      territory: country,
      collectedAt,
      confidence: 74,
      rawMetricKey: "lowRatingShare",
      rawValue: Number(((lowRatings / reviews.length) * 100).toFixed(2)),
      summary: "Derived from the share of low-rated reviews among the keyword's leading apps.",
      isEstimated: true,
    }),
    createSignal("keyword", entityId, term, "switching-intent", switchingIntent, {
      providerId: "apple-public-review-community",
      source: "community",
      territory: country,
      collectedAt,
      confidence: 66,
      rawMetricKey: "requestLikeReviews",
      rawValue: requestLikeReviews,
      summary: "Estimated from feature requests and dissatisfaction language in user reviews.",
      isEstimated: true,
    }),
  ];
}

export function buildAppleReviewSignals(
  appId: string,
  title: string,
  country: string,
  reviews: AppReview[],
): NormalizedMarketSignal[] {
  const collectedAt = new Date().toISOString();
  const averageRating = average(reviews.map((review) => review.rating));
  const complaintIntensity = reviews.length
    ? (reviews.filter((review) => review.rating <= 3).length / reviews.length) * 100
    : 0;

  return [
    createSignal("app", appId, title, "review-volume", scale(reviews.length, 200) * 100, {
      providerId: "apple-public-reviews",
      source: "apple-public",
      territory: country,
      collectedAt,
      confidence: 82,
      rawMetricKey: "reviewCount",
      rawValue: reviews.length,
      summary: "Derived from the fetched Apple customer review count.",
    }),
    createSignal("app", appId, title, "review-rating", scale(averageRating, 5) * 100, {
      providerId: "apple-public-reviews",
      source: "apple-public",
      territory: country,
      collectedAt,
      confidence: 82,
      rawMetricKey: "averageRating",
      rawValue: Number(averageRating.toFixed(2)),
      summary: "Derived from average rating in fetched Apple customer reviews.",
    }),
    createSignal("app", appId, title, "complaint-intensity", complaintIntensity, {
      providerId: "apple-public-reviews",
      source: "apple-public",
      territory: country,
      collectedAt,
      confidence: 73,
      rawMetricKey: "lowRatingShare",
      rawValue: Number(complaintIntensity.toFixed(2)),
      summary: "Estimated from the share of low-rated Apple customer reviews.",
      isEstimated: true,
    }),
  ];
}

export function mergeMarketSignals(
  signalCollections: Array<NormalizedMarketSignal[] | undefined>,
  options: { expectedSources?: MarketSignalSource[] } = {},
): { signals: NormalizedMarketSignal[]; coverage: SignalCoverageSummary } {
  const deduped = new Map<string, NormalizedMarketSignal>();
  for (const collection of signalCollections) {
    for (const signal of collection || []) {
      const key = [
        signal.entityKind,
        signal.entityId,
        signal.metric,
        signal.metadata.providerId,
        signal.metadata.territory,
      ].join(":" );
      const existing = deduped.get(key);
      if (!existing || existing.metadata.collectedAt < signal.metadata.collectedAt) {
        deduped.set(key, signal);
      }
    }
  }

  const signals = [...deduped.values()];
  const availableSources = [...new Set(signals.map((signal) => signal.metadata.source))] as MarketSignalSource[];
  const expectedSources = options.expectedSources || availableSources;
  const missingSources = expectedSources.filter((source) => !availableSources.includes(source));
  const averageConfidence = signals.length
    ? clampScore(average(signals.map((signal) => signal.metadata.confidence)))
    : 0;
  const freshestAt = signals
    .map((signal) => signal.metadata.collectedAt)
    .sort()
    .at(-1);

  return {
    signals,
    coverage: {
      availableSources,
      missingSources,
      averageConfidence,
      includesEstimatedValues: signals.some((signal) => signal.metadata.isEstimated),
      freshestAt,
    },
  };
}

export function buildSnapshotSourceCoverage(
  items: Array<{ marketSignals?: NormalizedMarketSignal[]; signalCoverage?: SignalCoverageSummary }>,
): SnapshotSourceSummary[] {
  const available = new Map<MarketSignalSource, SnapshotSourceSummary>();
  const missing = new Set<MarketSignalSource>();

  for (const item of items) {
    for (const signal of item.marketSignals || []) {
      const existing = available.get(signal.metadata.source);
      if (!existing) {
        available.set(signal.metadata.source, {
          providerId: signal.metadata.providerId,
          source: signal.metadata.source,
          available: true,
          freshnessHours: signal.metadata.freshnessHours,
          averageConfidence: signal.metadata.confidence,
          estimatedMetricCount: signal.metadata.isEstimated ? 1 : 0,
        });
        continue;
      }
      const estimatedMetricCount = (existing.estimatedMetricCount || 0) + (signal.metadata.isEstimated ? 1 : 0);
      const averageConfidence = average([
        existing.averageConfidence || 0,
        signal.metadata.confidence,
      ]);
      available.set(signal.metadata.source, {
        ...existing,
        freshnessHours:
          existing.freshnessHours === undefined
            ? signal.metadata.freshnessHours
            : Math.min(existing.freshnessHours, signal.metadata.freshnessHours || existing.freshnessHours),
        averageConfidence: clampScore(averageConfidence),
        estimatedMetricCount,
      });
    }
    for (const source of item.signalCoverage?.missingSources || []) {
      if (!available.has(source)) {
        missing.add(source);
      }
    }
  }

  const availableEntries = [...available.values()].sort((left, right) => left.source.localeCompare(right.source));
  const missingEntries = [...missing]
    .filter((source) => !available.has(source))
    .sort((left, right) => left.localeCompare(right))
    .map((source) => ({
      providerId: source,
      source,
      available: false,
    }));

  return [...availableEntries, ...missingEntries];
}