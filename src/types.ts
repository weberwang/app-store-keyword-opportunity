// ─── App Store 数据结构 ────────────────────────────────────────────────────────

export interface AppInfo {
  id: string;
  title: string;
  url: string;
  developer: string;
  developerId: string;
  genre: string;
  score: number;
  reviews: number;
  price: number;
  free: boolean;
  contentRating: string | null;
  releasedAt: string | null;
  updatedAt: string | null;
  description: string | null;
}

export interface SuggestionItem {
  term: string;
  rank: number;
}

// ─── 评分 / 打分 ───────────────────────────────────────────────────────────────

export interface CompetitionMetrics {
  exactTitleMatches: number;
  medianReviewCount: number;
  top3ReviewSum: number;
  averageTopRating: number;
  topDeveloperShare: number;
  top3AppConcentration: number;
}

export interface DemandInput {
  bestRank: number | null;
  suggestionCount: number;
  resultCount: number;
}

export interface OpportunityInput {
  demandScore: number;
  competitionScore: number;
  relevanceScore: number;
  monetizationScore?: number;
  marketGapScore?: number;
}

// ─── 洞察 ─────────────────────────────────────────────────────────────────────

export interface MarketInsightSummary {
  appCount: number;
  freeCount: number;
  paidCount: number;
  avgScore: number;
  uniqueDevs: number;
  staleCount: number;
  qualityGap: boolean;
  topDeveloper: string | null;
  topDeveloperAppCount: number;
}

export interface MarketInsight {
  summary?: MarketInsightSummary;
  hints: string[];
}

// ─── 快照 ─────────────────────────────────────────────────────────────────────

export interface TrendResult {
  trendScore: number;
  bestCompetitorRank: number | null;
  competitorRankCount: number;
  titleMatchRanks: number[];
  titleMatchCount: number;
}

export interface KeywordResult {
  term: string;
  normalized: string;
  country: string;
  seeds: string[];
  bestSuggestionRank: number | null;
  suggestionCount: number;
  sourceCount: number;
  relevanceScore: number;
  demandScore: number;
  competitionScore: number;
  monetizationScore: number;
  marketGapScore: number;
  opportunityScore: number;
  metrics: CompetitionMetrics;
  insight: MarketInsight;
  topApps: AppInfo[];
  trend?: TrendResult;
}

export interface SnapshotMeta {
  generatedAt: string | null;
  country: string;
  language: string;
  seeds: string[];
  genreId?: string;
  totalKeywords: number;
}

export interface Snapshot {
  meta: SnapshotMeta;
  keywords: KeywordResult[];
}

// ─── 榜单 ─────────────────────────────────────────────────────────────────────

export interface ChartApp {
  rank: number;
  id: string;
  title: string;
  developer: string;
  category: string;
  price: number;
  releaseDate: string | null;
  chartType?: string;
}

export interface ChartWord {
  word: string;
  count: number;
  bestRank: number | null;
  exampleApps: string[];
}

export interface ChartCategory {
  category: string;
  count: number;
  ratio: number;
}

export interface ChartTrendResult {
  totalApps: number;
  fetchedAt: string;
  topCategories: ChartCategory[];
  topWords: ChartWord[];
  monetization: {
    freeCount: number;
    paidCount: number;
    avgPaidPrice: number;
  };
}

// ─── 查询 ─────────────────────────────────────────────────────────────────────

export interface QueryFilters {
  q?: string;
  country?: string;
  category?: string;
  include?: string | string[];
  requireAll?: string | string[];
  exclude?: string | string[];
  minOpportunity?: number;
  maxCompetition?: number;
  minDemand?: number;
  minMonetization?: number;
  minMarketGap?: number;
  maxTitleMatches?: number;
  maxMedianReviews?: number;
  limit?: number;
  sortBy?: "opportunity" | "competition" | "demand";
}

// ─── 评论分析 ─────────────────────────────────────────────────────────────────

export interface ReviewWord {
  word: string;
  count: number;
}

export interface AppReviewSummary {
  id: string;
  title: string;
  reviewsFetched: number;
  positiveCount: number;
  negativeCount: number;
  avgScore: number | null;
  totalRatings: number | null;
}

export interface ReviewAnalysisResult {
  appSummaries: AppReviewSummary[];
  painPoints: ReviewWord[];
  sellingPoints: ReviewWord[];
  painExamples: Map<string, string>;
  ratingHistogram: Record<number, number>;
  totalRatings: number;
  reviewsFetched: number;
  country: string;
  analyzedAt: string;
}

// ─── 多国对比 ─────────────────────────────────────────────────────────────────

export interface CountryScore {
  country: string;
  term: string;
  resultCount?: number;
  demandScore: number;
  competitionScore: number;
  opportunityScore: number;
  freeRatio?: number;
  avgAppScore?: number;
  metrics?: CompetitionMetrics;
  topApp?: { title: string; score: number; developer: string } | null;
  empty: boolean;
  error?: boolean;
}

export interface TermSummary {
  term: string;
  bestCountry: string;
  bestOpportunityScore: number;
  worstCountry: string;
  countryResults: CountryScore[];
  spread: number;
}

export interface CountrySummary {
  country: string;
  avgOpportunity: number;
  avgCompetition: number;
  avgAppScore: number;
  count: number;
}

export interface CountryCompareResult {
  termSummaries: TermSummary[];
  countrySummaries: CountrySummary[];
  flat: CountryScore[];
  analyzedAt: string;
}

// ─── 策略报告 ─────────────────────────────────────────────────────────────────

export interface RoadmapStage {
  phase: string;
  actions: string[];
}

export interface ProductStrategy {
  opportunities: {
    qualityGap: KeywordResult[];
    staleMarket: KeywordResult[];
    blueOcean: KeywordResult[];
    dominated: KeywordResult[];
  };
  monetizationModel: string;
  monetizationReason: string;
  positioningHints: string[];
  roadmap: RoadmapStage[];
  meta: {
    totalKeywords: number;
    avgOpportunityScore: number;
    topOpportunityTerm: string;
  };
}

// ─── 采集参数 ─────────────────────────────────────────────────────────────────

export interface CollectOptions {
  seeds?: string | string[];
  country?: string;
  language?: string;
  genreId?: string;
  suggestionsLimit?: number;
  resultsLimit?: number;
  detailLimit?: number;
  concurrency?: number;
}
