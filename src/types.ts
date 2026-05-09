export const discoveryModes = ["trend", "keyword", "replacement"] as const;
export type DiscoveryMode = (typeof discoveryModes)[number];

export const evidenceDimensions = [
	"demand",
	"competition",
	"marketGap",
	"painIntensity",
	"monetizationPotential",
	"trendMomentum",
	"regionalFit",
	"supplyFreshness",
	"replacementPressure",
	"implementationFeasibility",
	"risk",
] as const;
export type EvidenceDimension = (typeof evidenceDimensions)[number];

export const decisionTiers = [
	"pursue-now",
	"validate-next",
	"monitor",
	"discard",
] as const;
export type DecisionTier = (typeof decisionTiers)[number];

export const marketSignalSources = [
	"apple-public",
	"aso-provider",
	"community",
	"trend",
	"first-party",
	"imported",
] as const;
export type MarketSignalSource = (typeof marketSignalSources)[number];

export const marketSignalEntityKinds = ["keyword", "app", "topic"] as const;
export type MarketSignalEntityKind = (typeof marketSignalEntityKinds)[number];

export const marketSignalMetrics = [
	"demand-volume",
	"demand-durability",
	"keyword-volume",
	"keyword-difficulty",
	"competition-density",
	"ranking-velocity",
	"chart-momentum",
	"trend-momentum",
	"review-rating",
	"review-volume",
	"complaint-intensity",
	"supply-staleness",
	"paid-share",
	"price-point",
	"download-estimate",
	"revenue-estimate",
	"community-intent",
	"switching-intent",
	"entry-feasibility",
] as const;
export type MarketSignalMetric = (typeof marketSignalMetrics)[number];

export const highValueDimensions = [
	"demandDurability",
	"supplyWeakness",
	"monetizationEvidence",
	"entryFeasibility",
	"evidenceConfidence",
] as const;
export type HighValueDimension = (typeof highValueDimensions)[number];

export interface ProviderSignalMetadata {
	providerId: string;
	source: MarketSignalSource;
	territory: string;
	collectedAt: string;
	freshnessHours?: number;
	confidence: number;
	isEstimated: boolean;
	rawMetricKey?: string;
	rawValue?: number | string | null;
	summary?: string;
}

export interface NormalizedMarketSignal {
	entityKind: MarketSignalEntityKind;
	entityId: string;
	entityLabel: string;
	metric: MarketSignalMetric;
	value: number;
	metadata: ProviderSignalMetadata;
}

export interface SignalCoverageSummary {
	availableSources: MarketSignalSource[];
	missingSources: MarketSignalSource[];
	averageConfidence: number;
	includesEstimatedValues: boolean;
	freshestAt?: string;
}

export interface HighValueDimensionAssessment {
	score: number;
	summary: string;
	evidence: string[];
	signalMetrics: MarketSignalMetric[];
	missing: boolean;
}

export type HighValueDimensionMap = Record<HighValueDimension, HighValueDimensionAssessment>;

export interface HighValueOpportunitySummary {
	overallScore: number;
	dimensions: HighValueDimensionMap;
	buildRecommendation: string;
	strongestSignals: string[];
	blockers: string[];
	missingEvidenceSources: MarketSignalSource[];
}

export interface ProviderCollectionContext {
	country?: string;
	language?: string;
	genreId?: string;
	collectedAt?: string;
}

export interface ProviderEntityRequest extends ProviderCollectionContext {
	keywords?: string[];
	appIds?: string[];
	topics?: string[];
}

export interface ApplePublicSignalProviderRequest extends ProviderEntityRequest {
	includeReviews?: boolean;
	includeCharts?: boolean;
	chartType?: "top-free" | "top-paid" | "new-apps";
}

export interface AsoSignalProviderRequest extends ProviderEntityRequest {
	providerAccount?: string;
}

export interface CommunityTrendProviderRequest extends ProviderEntityRequest {
	sources?: string[];
	windowDays?: number;
}

export interface ImportedProviderSignalRecord {
	entityKind: MarketSignalEntityKind;
	entityId: string;
	entityLabel?: string;
	metric: MarketSignalMetric;
	value: number;
	territory?: string;
	collectedAt?: string;
	confidence?: number;
	isEstimated?: boolean;
	rawMetricKey?: string;
	rawValue?: number | string | null;
	summary?: string;
}

export interface ImportedProviderSignalSnapshot {
	providerId: string;
	generatedAt?: string;
	signals: ImportedProviderSignalRecord[];
}

export interface MarketSignalProvider<TRequest = ProviderEntityRequest> {
	readonly id: string;
	readonly source: MarketSignalSource;
	collect(request: TRequest): Promise<NormalizedMarketSignal[]>;
}

export interface DimensionAssessment {
	score: number;
	summary: string;
	evidence: string[];
	missing: boolean;
}

export type DimensionMap = Record<EvidenceDimension, DimensionAssessment>;

export interface EvidenceTrace {
	claim: string;
	dimensions: EvidenceDimension[];
}

export interface OpportunityBrief {
	headline: string;
	targetUser: string;
	coreProblem: string;
	appConcept: string;
	buildThesis?: string;
	supportingEvidenceSummary: string[];
	strongestSupportingEvidence?: string[];
	competitiveFraming: string;
	monetizationHypothesis: string;
	primaryRisks: string[];
	blockers?: string[];
	confidenceGaps?: string[];
	nextValidationSteps: string[];
	evidenceTrace: EvidenceTrace[];
	rejectionReasons: string[];
}

export interface RankedCandidate {
	id: string;
	mode: DiscoveryMode;
	title: string;
	targetUser: string;
	coreProblem: string;
	appConcept: string;
	opportunityShape: string;
	seed: string;
	region: string;
	evidence: DimensionMap;
	highValueModel?: HighValueOpportunitySummary;
	marketSignals?: NormalizedMarketSignal[];
	signalCoverage?: SignalCoverageSummary;
	missingDimensions: EvidenceDimension[];
	attractiveness: number;
	confidence: number;
	decisionTier: DecisionTier;
	brief: OpportunityBrief;
}

export interface WorkflowResult {
	mode: DiscoveryMode;
	generatedAt: string;
	candidates: RankedCandidate[];
}

export interface TrendSignalInput {
	label: string;
	targetUser: string;
	coreProblem: string;
	region?: string;
	chartMomentum?: number;
	categoryAcceleration?: number;
	reviewMomentum?: number;
	monetizationShift?: number;
	timeSensitivity?: number;
	distributionChange?: number;
	competition?: number;
	painIntensity?: number;
	marketGap?: number;
	monetizationPotential?: number;
	regionalFit?: number;
	implementationFeasibility?: number;
	risk?: number;
	durability?: number;
	corroboratingSignals?: string[];
	opportunityShape?: string;
}

export interface KeywordSeedInput {
	seed: string;
	targetUser: string;
	coreProblem: string;
	region?: string;
	baseDemand?: number;
	baseCompetition?: number;
	basePainIntensity?: number;
	baseMonetizationPotential?: number;
	baseRegionalFit?: number;
	intents?: string[];
	personas?: string[];
	workflowSlices?: string[];
	relatedProblems?: string[];
}

export interface ReplacementAppInput {
	appName: string;
	category: string;
	targetUser: string;
	coreProblem: string;
	region?: string;
	ongoingDemandVisibility?: number;
	reviewActivity?: number;
	updateStagnationMonths?: number;
	uxFreshness?: number;
	unresolvedComplaintIntensity?: number;
	modernAlternativeRequests?: number;
	lockInStrength?: number;
	monetizationPotential?: number;
	competition?: number;
	regionalFit?: number;
	implementationFeasibility?: number;
	risk?: number;
}

export interface WorkflowRequest {
	mode: DiscoveryMode;
	topN?: number;
	trendSignals?: TrendSignalInput[];
	keywordSeed?: KeywordSeedInput;
	replacementApps?: ReplacementAppInput[];
}

export interface SkillWorkflowResponse {
	overview: string;
	recommendedPrompts: string[];
	candidates: RankedCandidate[];
}

export interface AppStoreApp {
	id: string;
	title: string;
	developer: string;
	description?: string;
	score: number;
	reviews: number;
	price: number;
	formattedPrice: string;
	currency?: string;
	free: boolean;
	genre: string;
	genreId?: string;
	url?: string;
	icon?: string;
	releasedAt?: string;
	updatedAt?: string;
	version?: string;
	contentAdvisoryRating?: string;
}

export interface ChartApp extends AppStoreApp {
	rank: number;
	chartType: string;
}

export interface AppReview {
	id: string;
	title: string;
	content: string;
	rating: number;
	author: string;
	version?: string;
	updatedAt?: string;
	voteSum?: number;
	voteCount?: number;
}

export interface CompetitionMetrics {
	exactTitleMatches: number;
	partialTitleMatches: number;
	medianReviewCount: number;
	avgRating: number;
	paidRatio: number;
}

export interface KeywordInsight {
	summary: string;
	hints: string[];
}

export interface KeywordResult {
	term: string;
	seeds: string[];
	country: string;
	opportunityScore: number;
	demandScore: number;
	competitionScore: number;
	monetizationScore: number;
	marketGapScore: number;
	relevanceScore: number;
	topApps: AppStoreApp[];
	metrics: CompetitionMetrics & {
		resultCount: number;
	};
	marketSignals?: NormalizedMarketSignal[];
	signalCoverage?: SignalCoverageSummary;
	highValueSummary?: HighValueOpportunitySummary;
	insight?: KeywordInsight;
}

export interface SnapshotSourceSummary {
	providerId: string;
	source: MarketSignalSource;
	available: boolean;
	freshnessHours?: number;
	averageConfidence?: number;
	estimatedMetricCount?: number;
}

export interface SnapshotMeta {
	generatedAt: string | null;
	country: string;
	language: string;
	seeds: string[];
	totalKeywords: number;
	genreId?: string;
	sourceCoverage?: SnapshotSourceSummary[];
	providerWarnings?: string[];
}

export interface Snapshot {
	meta: SnapshotMeta;
	keywords: KeywordResult[];
	candidates?: RankedCandidate[];
}

export interface QueryFilters {
	q?: string;
	country?: string;
	category?: string;
	providerSources?: string;
	include?: string;
	requireAll?: string;
	exclude?: string;
	minSourceConfidence?: number;
	maxFreshnessHours?: number;
	includeEstimated?: boolean;
	minOpportunity?: number;
	maxCompetition?: number;
	minDemand?: number;
	minMonetization?: number;
	minMarketGap?: number;
	minHighValueScore?: number;
	minDemandDurability?: number;
	minSupplyWeakness?: number;
	minMonetizationEvidence?: number;
	minEntryFeasibility?: number;
	minEvidenceConfidence?: number;
	maxTitleMatches?: number;
	maxMedianReviews?: number;
	limit?: number;
	sortBy?: "opportunity" | "competition" | "demand" | "high-value";
}

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
	topApp?: Pick<AppStoreApp, "title" | "developer" | "score"> | null;
	empty?: boolean;
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