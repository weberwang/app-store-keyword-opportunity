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
	supportingEvidenceSummary: string[];
	competitiveFraming: string;
	monetizationHypothesis: string;
	primaryRisks: string[];
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