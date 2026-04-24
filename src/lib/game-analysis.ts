import { collectGameKeywordSnapshot } from "./collector.js";
import { analyzeCompetitorReviews } from "./review-analysis.js";
import { fetchChart } from "./trends.js";
import { countFrequentTerms } from "./text.js";
import { defaultGameGenreId, filterGameApps } from "./game-utils.js";
import type { ChartApp, KeywordResult, Snapshot } from "../types.js";
const gameChartUpstreamLimit = 100;

interface GameTrackCharts {
  topFree: ChartApp[];
  topPaid: ChartApp[];
  newApps: ChartApp[];
  warnings: string[];
}

interface GameReviewSummary {
  reviewsFetched: number;
  appSummaries: Array<{
    appId: string;
    title: string;
    reviewsFetched: number;
    averageRating: number;
    topPainPoints: string[];
    topSellingPoints: string[];
  }>;
  painPoints: Array<{ term: string; count: number }>;
  sellingPoints: Array<{ term: string; count: number }>;
  ratingHistogram: Record<number, number>;
  totalRatings: number;
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

function uniqueApps(charts: ChartApp[][]): ChartApp[] {
  const seen = new Map<string, ChartApp>();
  for (const chart of charts) {
    for (const app of chart) {
      if (!seen.has(app.id)) {
        seen.set(app.id, app);
      }
    }
  }
  return [...seen.values()];
}

function buildChartSummary(apps: ChartApp[]) {
  return {
    count: apps.length,
    averageRating: Number(average(apps.map((app) => app.score || 0)).toFixed(2)),
    medianReviews: Math.round(median(apps.map((app) => app.reviews || 0))),
    topTitles: apps.slice(0, 5).map((app) => ({
      rank: app.rank,
      title: app.title,
      developer: app.developer,
      genre: app.genre,
      score: app.score,
      reviews: app.reviews,
      updatedAt: app.updatedAt,
    })),
    titleTerms: countFrequentTerms(apps.map((app) => app.title), { limit: 8 }).map((item) => ({
      term: item.term,
      count: item.count,
    })),
  };
}

function buildPublisherConcentration(apps: ChartApp[]) {
  if (!apps.length) {
    return {
      topPublishers: [] as Array<{ developer: string; count: number; share: number }>,
      leaderShare: 0,
    };
  }

  const counts = new Map<string, number>();
  for (const app of apps) {
    counts.set(app.developer, (counts.get(app.developer) || 0) + 1);
  }

  const topPublishers = [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([developer, count]) => ({
      developer,
      count,
      share: Math.round((count / apps.length) * 100),
    }));

  return {
    topPublishers,
    leaderShare: topPublishers[0]?.share || 0,
  };
}

function buildCrossChartLeaders(charts: GameTrackCharts) {
  const appearances = new Map<string, { title: string; developer: string; charts: string[] }>();
  for (const [chartType, apps] of Object.entries({
    topFree: charts.topFree,
    topPaid: charts.topPaid,
    newApps: charts.newApps,
  })) {
    for (const app of apps) {
      const current = appearances.get(app.id) || {
        title: app.title,
        developer: app.developer,
        charts: [],
      };
      current.charts.push(chartType);
      appearances.set(app.id, current);
    }
  }

  return [...appearances.entries()]
    .map(([appId, value]) => ({ appId, ...value }))
    .filter((item) => item.charts.length >= 2)
    .sort((left, right) => right.charts.length - left.charts.length)
    .slice(0, 8);
}

function buildLiveOpsSignal(apps: ChartApp[]) {
  const ages = apps
    .map((app) => daysSince(app.updatedAt))
    .filter((value): value is number => typeof value === "number");
  const medianUpdateAgeDays = Math.round(median(ages));
  const staleShare = ages.length
    ? Math.round((ages.filter((age) => age >= 90).length / ages.length) * 100)
    : 0;

  return {
    medianUpdateAgeDays,
    staleShare,
  };
}

function buildGameInsights(input: {
  charts: GameTrackCharts;
  publisherConcentration: { leaderShare: number };
  crossChartLeaders: Array<{ charts: string[] }>;
  liveOps: { medianUpdateAgeDays: number; staleShare: number };
  reviewSummary?: GameReviewSummary;
}) {
  const insights: string[] = [];

  if (input.publisherConcentration.leaderShare >= 30) {
    insights.push("头部厂商集中度高，买量和 live-ops 护城河更强。")
  } else if (input.publisherConcentration.leaderShare <= 15) {
    insights.push("头部厂商分散，细分玩法切入空间相对更大。")
  }

  if (input.liveOps.medianUpdateAgeDays > 0 && input.liveOps.medianUpdateAgeDays <= 21) {
    insights.push("头部产品更新节奏很快，说明赛道 live-ops 压力较高。")
  } else if (input.liveOps.medianUpdateAgeDays >= 60) {
    insights.push("头部产品更新偏慢，赛道可能存在运营节奏空档。")
  }

  if (input.crossChartLeaders.length >= 3) {
    insights.push("同一批产品同时占据多张榜单，头部惯性明显。")
  } else if (input.charts.newApps.length && input.crossChartLeaders.length === 0) {
    insights.push("新游与现有头部榜单重合低，说明新品晋升链路还不稳定。")
  }

  if (input.reviewSummary?.painPoints?.length) {
    insights.push(`核心差评集中在：${input.reviewSummary.painPoints.slice(0, 3).map((item) => item.term).join(" / ")}。`);
  }

  if (!insights.length) {
    insights.push("榜单结构较平，需要结合评论和跨国对比再判断具体切入口。")
  }

  return insights;
}

export async function fetchGameTrackCharts(
  country: string,
  genreId: string = defaultGameGenreId,
  limit: number = 50,
): Promise<GameTrackCharts> {
  const upstreamLimit = genreId === defaultGameGenreId ? gameChartUpstreamLimit : limit;
  const upstreamGenreId = genreId === defaultGameGenreId ? "" : genreId;
  const entries = await Promise.allSettled([
    fetchChart(country, "top-free", upstreamLimit, upstreamGenreId),
    fetchChart(country, "top-paid", upstreamLimit, upstreamGenreId),
    fetchChart(country, "new-apps", upstreamLimit, upstreamGenreId),
  ]);

  const chartNames = ["top-free", "top-paid", "new-apps"] as const;
  const warnings: string[] = [];
  const charts = {
    topFree: [] as ChartApp[],
    topPaid: [] as ChartApp[],
    newApps: [] as ChartApp[],
  };

  entries.forEach((entry, index) => {
    const chartName = chartNames[index];
    if (entry.status === "fulfilled") {
      const filtered = filterGameApps(entry.value, genreId).slice(0, limit);
      if (chartName === "top-free") charts.topFree = filtered;
      if (chartName === "top-paid") charts.topPaid = filtered;
      if (chartName === "new-apps") charts.newApps = filtered;
      return;
    }
    warnings.push(`${chartName} unavailable: ${entry.reason instanceof Error ? entry.reason.message : String(entry.reason)}`);
  });

  return {
    ...charts,
    warnings,
  };
}

export function buildGameTrackAnalysis(
  input: {
    country: string;
    genreId?: string;
    charts: GameTrackCharts;
    reviewSummary?: GameReviewSummary;
  },
) {
  const genreId = input.genreId || defaultGameGenreId;
  const allApps = uniqueApps([input.charts.topFree, input.charts.topPaid, input.charts.newApps]);
  const publisherConcentration = buildPublisherConcentration(allApps);
  const crossChartLeaders = buildCrossChartLeaders(input.charts);
  const liveOps = buildLiveOpsSignal(allApps);

  return {
    analyzedAt: new Date().toISOString(),
    country: input.country,
    genreId,
    warnings: input.charts.warnings,
    market: {
      totalTrackedGames: allApps.length,
      publisherConcentration,
      crossChartLeaders,
      liveOps,
    },
    charts: {
      topFree: buildChartSummary(input.charts.topFree),
      topPaid: buildChartSummary(input.charts.topPaid),
      newApps: buildChartSummary(input.charts.newApps),
    },
    reviewSignals: input.reviewSummary
      ? {
          reviewsFetched: input.reviewSummary.reviewsFetched,
          painPoints: input.reviewSummary.painPoints.slice(0, 10),
          sellingPoints: input.reviewSummary.sellingPoints.slice(0, 10),
          appSummaries: input.reviewSummary.appSummaries.slice(0, 6),
          ratingHistogram: input.reviewSummary.ratingHistogram,
        }
      : null,
    insights: buildGameInsights({
      charts: input.charts,
      publisherConcentration,
      crossChartLeaders,
      liveOps,
      reviewSummary: input.reviewSummary,
    }),
  };
}

export async function analyzeGameTrack(options: {
  country?: string;
  genreId?: string;
  limit?: number;
  includeReviews?: boolean;
  reviewPages?: number;
  competitorCount?: number;
}) {
  const country = (options.country || "us").trim().toLowerCase();
  const genreId = options.genreId || defaultGameGenreId;
  const limit = Math.min(Math.max(options.limit || 50, 1), 100);
  const charts = await fetchGameTrackCharts(country, genreId, limit);

  if (!charts.topFree.length && !charts.topPaid.length && !charts.newApps.length) {
    throw new Error(`没有拉到可用于分析的游戏榜单数据。${charts.warnings.join(" ")}`.trim());
  }

  let reviewSummary: GameReviewSummary | undefined;
  if (options.includeReviews !== false) {
    const reviewSourceApps = uniqueApps([charts.topFree, charts.topPaid]).slice(0, Math.min(options.competitorCount || 5, 8));
    if (reviewSourceApps.length) {
      reviewSummary = await analyzeCompetitorReviews(
        reviewSourceApps.map((app) => ({ id: app.id, title: app.title })),
        { country, pages: Math.min(Math.max(options.reviewPages || 2, 1), 5) },
      );
    }
  }

  return buildGameTrackAnalysis({
    country,
    genreId,
    charts,
    reviewSummary,
  });
}

function topKeywords(items: KeywordResult[], predicate: (item: KeywordResult) => boolean, limit: number): KeywordResult[] {
  return items.filter(predicate).slice(0, limit);
}

function buildGameKeywordInsights(keywords: KeywordResult[], snapshot: Snapshot) {
  const insights: string[] = [];
  const averageCompetition = Math.round(average(keywords.map((item) => item.competitionScore)));
  const averageHighValue = Math.round(
    average(keywords.map((item) => item.highValueSummary?.overallScore || item.opportunityScore)),
  );
  const averageMonetization = Math.round(average(keywords.map((item) => item.monetizationScore)));

  if (averageCompetition >= 60) {
    insights.push("游戏关键词整体竞争偏高，优先看更窄的玩法或人群切分词。");
  } else if (averageCompetition <= 40) {
    insights.push("游戏关键词整体竞争还不算高，存在继续下钻细分玩法的空间。");
  }

  if (averageMonetization >= 35) {
    insights.push("搜索结果里的付费与高价值产品信号较强，说明该赛道更适合验证变现深度。");
  }

  if ((snapshot.meta.sourceCoverage || []).some((item) => item.source === "aso-provider" && item.available)) {
    insights.push("当前结果已包含外部 ASO provider 信号，可优先参考关键词量级和下载估算。");
  }

  if (averageHighValue >= 55) {
    insights.push("高价值综合分处于可继续验证区间，适合继续做素材、落地页或评论访谈。");
  }

  if (!insights.length) {
    insights.push("先观察高供给弱点和高需求持续性的交集词，再决定是否深入赛道。");
  }

  return insights;
}

export function buildGameKeywordAnalysis(snapshot: Snapshot, options: { limit?: number } = {}) {
  const limit = Math.min(Math.max(options.limit || 20, 1), 50);
  const sorted = [...(snapshot.keywords || [])].sort(
    (left, right) =>
      (right.highValueSummary?.overallScore || right.opportunityScore) -
      (left.highValueSummary?.overallScore || left.opportunityScore),
  );

  return {
    analyzedAt: new Date().toISOString(),
    country: snapshot.meta.country,
    genreId: snapshot.meta.genreId || defaultGameGenreId,
    totalKeywords: sorted.length,
    sourceCoverage: snapshot.meta.sourceCoverage,
    providerWarnings: snapshot.meta.providerWarnings || [],
    summary: {
      averageOpportunity: Math.round(average(sorted.map((item) => item.opportunityScore))),
      averageHighValue: Math.round(average(sorted.map((item) => item.highValueSummary?.overallScore || item.opportunityScore))),
      averageCompetition: Math.round(average(sorted.map((item) => item.competitionScore))),
      averageDemand: Math.round(average(sorted.map((item) => item.demandScore))),
      averageMonetization: Math.round(average(sorted.map((item) => item.monetizationScore))),
    },
    topOpportunities: sorted.slice(0, limit).map((item) => ({
      term: item.term,
      opportunityScore: item.opportunityScore,
      highValueScore: item.highValueSummary?.overallScore,
      demandScore: item.demandScore,
      competitionScore: item.competitionScore,
      monetizationScore: item.monetizationScore,
      sourceCoverage: item.signalCoverage,
      topApps: item.topApps.slice(0, 3).map((app) => ({
        title: app.title,
        developer: app.developer,
        genre: app.genre,
        score: app.score,
        reviews: app.reviews,
      })),
    })),
    keywordLenses: {
      demandLeaders: topKeywords(sorted, (item) => item.demandScore >= 70, 8).map((item) => item.term),
      lowCompetition: topKeywords(sorted, (item) => item.competitionScore <= 40, 8).map((item) => item.term),
      monetizationLeaders: topKeywords(sorted, (item) => item.monetizationScore >= 35, 8).map((item) => item.term),
      buildableWhitespace: topKeywords(
        sorted,
        (item) => (item.highValueSummary?.dimensions.supplyWeakness.score || item.marketGapScore) >= 55,
        8,
      ).map((item) => item.term),
    },
    insights: buildGameKeywordInsights(sorted, snapshot),
  };
}

export async function analyzeGameKeywords(options: {
  seeds: string;
  country?: string;
  language?: string;
  genreId?: string;
  asoSnapshotFile?: string;
  asoSnapshot?: any;
  suggestionsLimit?: number;
  resultsLimit?: number;
  detailLimit?: number;
  concurrency?: number;
  limit?: number;
}) {
  const snapshot = await collectGameKeywordSnapshot({
    seeds: options.seeds,
    country: options.country,
    language: options.language,
    genreId: options.genreId,
    asoSnapshotFile: options.asoSnapshotFile,
    asoSnapshot: options.asoSnapshot,
    suggestionsLimit: options.suggestionsLimit,
    resultsLimit: options.resultsLimit,
    detailLimit: options.detailLimit,
    concurrency: options.concurrency,
  });

  return {
    snapshot,
    analysis: buildGameKeywordAnalysis(snapshot, { limit: options.limit }),
  };
}

export function buildGameHeatAnalysis(input: {
  country: string;
  genreId?: string;
  charts: GameTrackCharts;
}) {
  const allApps = uniqueApps([input.charts.topFree, input.charts.topPaid, input.charts.newApps]);
  const chartWeights = new Map([
    ["top-free", 1],
    ["top-paid", 1.15],
    ["new-apps", 1.3],
  ]);

  const genreHeat = new Map<string, number>();
  const publisherHeat = new Map<string, number>();
  const titleHeat = new Map<string, { title: string; developer: string; score: number; charts: Set<string> }>();

  for (const app of allApps) {
    const charts = [input.charts.topFree, input.charts.topPaid, input.charts.newApps]
      .flat()
      .filter((item) => item.id === app.id);
    const heatScore = charts.reduce((sum, item) => {
      const weight = chartWeights.get(item.chartType) || 1;
      return sum + Math.max(0, 101 - item.rank) * weight;
    }, 0);

    genreHeat.set(app.genre, (genreHeat.get(app.genre) || 0) + heatScore);
    publisherHeat.set(app.developer, (publisherHeat.get(app.developer) || 0) + heatScore);
    titleHeat.set(app.id, {
      title: app.title,
      developer: app.developer,
      score: Math.round(heatScore),
      charts: new Set(charts.map((item) => item.chartType)),
    });
  }

  const risingGames = [...titleHeat.entries()]
    .map(([appId, value]) => ({
      appId,
      title: value.title,
      developer: value.developer,
      heatScore: value.score,
      charts: [...value.charts],
    }))
    .filter((item) => item.charts.includes("new-apps") || item.charts.length >= 2)
    .sort((left, right) => right.heatScore - left.heatScore)
    .slice(0, 8);

  const insights: string[] = [];
  if (risingGames.some((item) => item.charts.includes("new-apps") && item.charts.length >= 2)) {
    insights.push("有新游已经从 new-apps 外溢到主榜，赛道短期热度在上行。");
  }
  if ((input.charts.newApps.length || 0) === 0) {
    insights.push("当前环境拿不到 new-apps 榜单，只能用主榜热度判断。");
  }

  return {
    analyzedAt: new Date().toISOString(),
    country: input.country,
    genreId: input.genreId || defaultGameGenreId,
    warnings: input.charts.warnings,
    hotSubgenres: [...genreHeat.entries()]
      .map(([genre, score]) => ({ genre, heatScore: Math.round(score) }))
      .sort((left, right) => right.heatScore - left.heatScore)
      .slice(0, 8),
    risingGames,
    publisherMomentum: [...publisherHeat.entries()]
      .map(([developer, score]) => ({ developer, heatScore: Math.round(score) }))
      .sort((left, right) => right.heatScore - left.heatScore)
      .slice(0, 8),
    titleTerms: countFrequentTerms(allApps.map((app) => app.title), { limit: 12 }).map((item) => ({
      term: item.term,
      count: item.count,
    })),
    insights,
  };
}

export async function analyzeGameHeat(options: {
  country?: string;
  genreId?: string;
  limit?: number;
}) {
  const country = (options.country || "us").trim().toLowerCase();
  const genreId = options.genreId || defaultGameGenreId;
  const limit = Math.min(Math.max(options.limit || 50, 1), 100);
  const charts = await fetchGameTrackCharts(country, genreId, limit);
  if (!charts.topFree.length && !charts.topPaid.length && !charts.newApps.length) {
    throw new Error(`没有拉到可用于分析的游戏热度数据。${charts.warnings.join(" ")}`.trim());
  }
  return buildGameHeatAnalysis({ country, genreId, charts });
}