import type { EvidenceDimension, DecisionTier } from "./types.js";

/**
 * Scoring weights for each evidence dimension.
 * Must sum to 1.0.
 */
export const dimensionWeights: Record<EvidenceDimension, number> = {
	demand: 0.15,
	competition: 0.12,
	marketGap: 0.12,
	painIntensity: 0.1,
	monetizationPotential: 0.1,
	trendMomentum: 0.08,
	regionalFit: 0.07,
	supplyFreshness: 0.08,
	replacementPressure: 0.08,
	implementationFeasibility: 0.05,
	risk: 0.05,
};

/**
 * Dimensions where a higher raw score is bad (inverted before weighting).
 */
export const invertedDimensions: ReadonlySet<EvidenceDimension> = new Set<EvidenceDimension>([
	"competition",
	"risk",
	"supplyFreshness",
]);

/**
 * Decision tier thresholds used in assignDecisionTier.
 */
export const decisionTierThresholds = {
	pursueNow: { minAttractiveness: 75, minConfidence: 70, maxRisk: 60 },
	validateNext: { minAttractiveness: 60, minConfidence: 50 },
	monitor: { minAttractiveness: 45 },
} as const;

/**
 * Tier priority order for sorting (index = priority, lower = better).
 */
export const tierSortOrder: DecisionTier[] = ["pursue-now", "validate-next", "monitor", "discard"];

/**
 * Confidence computation weights.
 */
export const confidenceWeights = {
	coverage: 0.65,
	corroboration: 0.35,
} as const;

/**
 * Fallback score used when a dimension has no evidence.
 */
export const MISSING_DIMENSION_FALLBACK_SCORE = 50;

/**
 * Default topN when not specified in the request.
 */
export const DEFAULT_TOP_N = 5;

/**
 * Default values for trend signal optional fields.
 */
export const trendDefaults = {
	regionalFit: 70,
	implementationFeasibility: 65,
	corroboratingSignalWeight: 20,
	durabilityCorroborationWeight: 0.4,
	durabilityFallback: 50,
} as const;

/**
 * Default values for keyword seed optional fields.
 */
export const keywordDefaults = {
	baseDemand: 60,
	baseCompetition: 65,
	basePainIntensity: 60,
	baseMonetizationPotential: 55,
	baseRegionalFit: 65,
} as const;

/**
 * Keyword segment bonuses applied to competition and related scores.
 */
export const keywordSegmentBonuses = {
	persona: 14,
	workflow: 12,
	intent: 8,
	broad: 0,
} as const;

/**
 * Keyword segment-specific adjustments.
 */
export const keywordSegmentAdjustments = {
	intentDemandBonus: 4,
	workflowPainBonus: 6,
	personaMonetizationBonus: 8,
	workflowFeasibility: 58,
	defaultFeasibility: 68,
	broadRiskBase: 65,
	narrowRiskBase: 45,
	trendMomentumBase: 40,
	marketGapBase: 45,
	corroborationBase: 45,
	corroborationBonusMultiplier: 2,
	demandNarrownessPenalty: 10,
} as const;

/**
 * Default values for replacement app optional fields.
 */
export const replacementDefaults = {
	competition: 45,
	monetizationPotential: 60,
	regionalFit: 65,
	implementationFeasibility: 62,
} as const;

/**
 * Replacement candidate filter thresholds.
 */
export const replacementFilterThresholds = {
	minStagnationMonths: 6,
	minReviewActivity: 25,
	minDemandVisibility: 35,
} as const;

/**
 * Monetization hypothesis score thresholds.
 */
export const monetizationThresholds = {
	strong: 75,
	moderate: 55,
} as const;

/**
 * Score band thresholds for describeBand().
 */
export const scoreBandThresholds = {
	positiveHigh: 75,
	positiveModerate: 55,
	negativeContained: 45,
	negativeLow: 25,
} as const;

/**
 * Rejection reason thresholds used in buildBrief().
 */
export const rejectionThresholds = {
	maxMarketGap: 45,
	maxRisk: 65,
	maxMonetization: 45,
} as const;

/**
 * Slug max length for candidate IDs.
 */
export const SLUG_MAX_LENGTH = 60;

/**
 * Trend shape thresholds.
 */
export const trendShapeThresholds = {
	monetizationInflection: 70,
	distributionShift: 65,
	emergingBehavior: 60,
} as const;
