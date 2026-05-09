import {
	evidenceDimensions,
	type DecisionTier,
	type DimensionAssessment,
	type DimensionMap,
	type EvidenceDimension,
	type EvidenceTrace,
	type KeywordSeedInput,
	type NormalizedMarketSignal,
	type OpportunityBrief,
	type RankedCandidate,
	type ReplacementAppInput,
	type SignalCoverageSummary,
	type TrendSignalInput,
	type WorkflowRequest,
	type WorkflowResult,
} from "./types.js";
import {
	confidenceWeights,
	decisionTierThresholds,
	DEFAULT_TOP_N,
	dimensionWeights,
	invertedDimensions,
	keywordDefaults,
	keywordSegmentAdjustments,
	keywordSegmentBonuses,
	MISSING_DIMENSION_FALLBACK_SCORE,
	monetizationThresholds,
	rejectionThresholds,
	replacementDefaults,
	replacementFilterThresholds,
	scoreBandThresholds,
	SLUG_MAX_LENGTH,
	tierSortOrder,
	trendDefaults,
	trendShapeThresholds,
} from "./config.js";
import { buildHighValueOpportunitySummary } from "./lib/scoring.js";

interface DraftCandidate {
	id: string;
	mode: RankedCandidate["mode"];
	title: string;
	targetUser: string;
	coreProblem: string;
	appConcept: string;
	opportunityShape: string;
	seed: string;
	region: string;
	rawScores: Partial<Record<EvidenceDimension, number | null>>;
	evidenceByDimension: Partial<Record<EvidenceDimension, string[]>>;
	summaries: Partial<Record<EvidenceDimension, string>>;
	corroboration: number;
	validationIdeas: string[];
	riskNotes: string[];
	marketSignals?: NormalizedMarketSignal[];
	signalCoverage?: SignalCoverageSummary;
}

function clampScore(value: number | null | undefined, fallback = MISSING_DIMENSION_FALLBACK_SCORE): number {
	if (value === null || value === undefined || Number.isNaN(value)) {
		return fallback;
	}
	return Math.min(100, Math.max(0, Math.round(value)));
}

function average(values: Array<number | null | undefined>): number | null {
	const valid = values.filter((value): value is number => typeof value === "number" && !Number.isNaN(value));
	if (!valid.length) {
		return null;
	}
	return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, SLUG_MAX_LENGTH);
}

function createDimension(
	name: EvidenceDimension,
	rawScore: number | null | undefined,
	summary: string | undefined,
	evidence: string[] | undefined,
): DimensionAssessment {
	const missing = rawScore === null || rawScore === undefined || Number.isNaN(rawScore);
	const score = clampScore(rawScore);
	const fallbackSummary = missing
		? `${name} lacks direct evidence, so the workflow used a neutral baseline and lowered confidence.`
		: `${name} is supported by explicit evidence.`;
	return {
		score,
		summary: summary || fallbackSummary,
		evidence: evidence?.length ? evidence : ["No direct evidence provided"],
		missing,
	};
}

function buildDimensions(draft: DraftCandidate): { dimensions: DimensionMap; missingDimensions: EvidenceDimension[] } {
	const entries = evidenceDimensions.map((dimension) => {
		const assessment = createDimension(
			dimension,
			draft.rawScores[dimension],
			draft.summaries[dimension],
			draft.evidenceByDimension[dimension],
		);
		return [dimension, assessment] as const;
	});
	const dimensions = Object.fromEntries(entries) as DimensionMap;
	const missingDimensions = evidenceDimensions.filter((dimension) => dimensions[dimension].missing);
	return { dimensions, missingDimensions };
}

function computeConfidence(dimensions: DimensionMap, corroboration: number, signalCoverage?: SignalCoverageSummary): number {
	const populated = evidenceDimensions.filter((dimension) => !dimensions[dimension].missing).length;
	const coverage = (populated / evidenceDimensions.length) * 100;
	const weightedCoverage = coverage * confidenceWeights.coverage + clampScore(corroboration) * confidenceWeights.corroboration;
	if (!signalCoverage) {
		return clampScore(weightedCoverage);
	}
	const sourcePenalty = (signalCoverage?.missingSources.length ?? 0) * 6;
	return clampScore(
		weightedCoverage * 0.75 +
		clampScore(signalCoverage.averageConfidence, MISSING_DIMENSION_FALLBACK_SCORE) * 0.25 -
		sourcePenalty,
	);
}

function computeAttractiveness(dimensions: DimensionMap): number {
	let weighted = 0;
	for (const dimension of evidenceDimensions) {
		let score = dimensions[dimension].score;
		if (invertedDimensions.has(dimension)) {
			score = 100 - score;
		}
		weighted += score * dimensionWeights[dimension];
	}
	return clampScore(weighted);
}

function assignDecisionTier(candidate: Pick<RankedCandidate, "attractiveness" | "confidence" | "highValueModel" | "evidence">): DecisionTier {
	const risk = candidate.evidence.risk.score;
	const highValueScore = candidate.highValueModel?.overallScore ?? candidate.attractiveness;
	const evidenceConfidence = candidate.highValueModel?.dimensions.evidenceConfidence.score ?? candidate.confidence;
	const demandDurability = candidate.highValueModel?.dimensions.demandDurability.score ?? candidate.evidence.demand.score;
	const monetizationEvidence = candidate.highValueModel?.dimensions.monetizationEvidence.score ?? candidate.evidence.monetizationPotential.score;
	const entryFeasibility = candidate.highValueModel?.dimensions.entryFeasibility.score ?? candidate.evidence.implementationFeasibility.score;
	const { pursueNow, validateNext, monitor } = decisionTierThresholds;

	if ((demandDurability < 45 && monetizationEvidence < 45) || (risk > 75 && entryFeasibility < 45)) {
		return "discard";
	}
	if (
		highValueScore >= Math.max(78, pursueNow.minAttractiveness) &&
		evidenceConfidence >= Math.max(65, pursueNow.minConfidence) &&
		risk <= Math.min(58, pursueNow.maxRisk)
	) {
		return "pursue-now";
	}
	if (
		(highValueScore >= 60 && candidate.confidence >= validateNext.minConfidence) ||
		(candidate.attractiveness >= validateNext.minAttractiveness && candidate.confidence >= validateNext.minConfidence)
	) {
		return "validate-next";
	}
	if (highValueScore >= monitor.minAttractiveness || candidate.attractiveness >= monitor.minAttractiveness) {
		return "monitor";
	}
	return "discard";
}

function describeBand(score: number, positiveHigh = true): string {
	if (positiveHigh) {
		if (score >= scoreBandThresholds.positiveHigh) {
			return "strong";
		}
		if (score >= scoreBandThresholds.positiveModerate) {
			return "moderate";
		}
		return "weak";
	}
	if (score <= scoreBandThresholds.negativeLow) {
		return "low";
	}
	if (score <= scoreBandThresholds.negativeContained) {
		return "contained";
	}
	return "elevated";
}

function buildEvidenceTrace(candidate: Omit<RankedCandidate, "brief">): EvidenceTrace[] {
	return [
		{
			claim: `Demand looks ${describeBand(candidate.evidence.demand.score)} for ${candidate.title}.`,
			dimensions: ["demand", candidate.mode === "trend" ? "trendMomentum" : "marketGap"],
		},
		{
			claim: `Commercial upside is ${describeBand(candidate.evidence.monetizationPotential.score)} with ${describeBand(100 - candidate.evidence.competition.score)} whitespace.`,
			dimensions: ["monetizationPotential", "competition", "marketGap"],
		},
		{
			claim: `Execution risk is ${describeBand(candidate.evidence.risk.score, false)} and feasibility is ${describeBand(candidate.evidence.implementationFeasibility.score)}.`,
			dimensions: ["risk", "implementationFeasibility"],
		},
	];
}

function buildMonetizationHypothesis(candidate: Omit<RankedCandidate, "brief">): string {
	const monetization = candidate.evidence.monetizationPotential.score;
	if (monetization >= monetizationThresholds.strong) {
		return "Users likely tolerate a subscription or premium workflow bundle if the product wins on clarity and execution speed.";
	}
	if (monetization >= monetizationThresholds.moderate) {
		return "A freemium offer with paid power features is plausible, but pricing should be validated against competitor expectations.";
	}
	return "Monetization looks fragile; validate willingness to pay before committing to a full product build.";
}

function buildCompetitiveFraming(candidate: Omit<RankedCandidate, "brief">): string {
	if (candidate.mode === "replacement") {
		return "The opening comes from stale supply: users still show up, but the incumbent experience is aging faster than the category demand.";
	}
	if (candidate.mode === "trend") {
		return "This is an early-shape opportunity where timing matters more than brute-force feature breadth.";
	}
	return "The opportunity depends on segment selection: the broad term is less attractive than a narrower intent or persona slice.";
}

function buildBrief(candidate: Omit<RankedCandidate, "brief">, draft: DraftCandidate): OpportunityBrief {
	const evidenceTrace = buildEvidenceTrace(candidate);
	const rejectionReasons = [...(candidate.highValueModel?.blockers || [])];
	if (candidate.decisionTier === "discard") {
		if (
			candidate.evidence.marketGap.score < rejectionThresholds.maxMarketGap &&
			!rejectionReasons.includes("Whitespace is too limited to justify a new entry.")
		) {
			rejectionReasons.push("Whitespace is too limited to justify a new entry.");
		}
		if (
			candidate.evidence.risk.score > rejectionThresholds.maxRisk &&
			!rejectionReasons.includes("Risk dominates the upside at the current evidence quality.")
		) {
			rejectionReasons.push("Risk dominates the upside at the current evidence quality.");
		}
		if (
			candidate.evidence.monetizationPotential.score < rejectionThresholds.maxMonetization &&
			!rejectionReasons.includes("Monetization fit looks too weak for a first pass build.")
		) {
			rejectionReasons.push("Monetization fit looks too weak for a first pass build.");
		}
	}
	const confidenceGaps = [
		...(candidate.signalCoverage?.missingSources.map((source) => `Missing signal source: ${source}`) || []),
		...candidate.missingDimensions.map((dimension) => `Missing evidence dimension: ${dimension}`),
	];

	return {
		headline: `${candidate.title} is a ${candidate.decisionTier} opportunity with ${candidate.confidence}% confidence.`,
		targetUser: candidate.targetUser,
		coreProblem: candidate.coreProblem,
		appConcept: candidate.appConcept,
		buildThesis: candidate.highValueModel?.buildRecommendation,
		supportingEvidenceSummary: [
			candidate.evidence.demand.summary,
			candidate.evidence.marketGap.summary,
			candidate.evidence.monetizationPotential.summary,
		],
		strongestSupportingEvidence: candidate.highValueModel?.strongestSignals,
		competitiveFraming: buildCompetitiveFraming(candidate),
		monetizationHypothesis: buildMonetizationHypothesis(candidate),
		primaryRisks: draft.riskNotes.length ? draft.riskNotes : [candidate.evidence.risk.summary],
		blockers: candidate.highValueModel?.blockers || [],
		confidenceGaps,
		nextValidationSteps: draft.validationIdeas,
		evidenceTrace,
		rejectionReasons,
	};
}

function rankCandidate(draft: DraftCandidate): RankedCandidate {
	const { dimensions, missingDimensions } = buildDimensions(draft);
	const highValueModel = buildHighValueOpportunitySummary({
		title: draft.title,
		demand: dimensions.demand.score,
		competition: dimensions.competition.score,
		marketGap: dimensions.marketGap.score,
		monetizationPotential: dimensions.monetizationPotential.score,
		implementationFeasibility: dimensions.implementationFeasibility.score,
		risk: dimensions.risk.score,
		trendMomentum: dimensions.trendMomentum.score,
		supplyFreshness: dimensions.supplyFreshness.missing ? null : dimensions.supplyFreshness.score,
		replacementPressure: dimensions.replacementPressure.missing ? null : dimensions.replacementPressure.score,
		painIntensity: dimensions.painIntensity.score,
		signalCoverage: draft.signalCoverage,
		signals: draft.marketSignals,
	});
	const confidence = clampScore(
		computeConfidence(dimensions, draft.corroboration, draft.signalCoverage) * 0.65 +
			highValueModel.dimensions.evidenceConfidence.score * 0.35,
	);
	const attractiveness = clampScore(computeAttractiveness(dimensions) * 0.55 + highValueModel.overallScore * 0.45);
	const candidateWithoutBrief = {
		id: draft.id,
		mode: draft.mode,
		title: draft.title,
		targetUser: draft.targetUser,
		coreProblem: draft.coreProblem,
		appConcept: draft.appConcept,
		opportunityShape: draft.opportunityShape,
		seed: draft.seed,
		region: draft.region,
		evidence: dimensions,
		highValueModel,
		marketSignals: draft.marketSignals,
		signalCoverage: draft.signalCoverage,
		missingDimensions,
		attractiveness,
		confidence,
		decisionTier: "monitor" as DecisionTier,
	} satisfies Omit<RankedCandidate, "brief">;
	candidateWithoutBrief.decisionTier = assignDecisionTier(candidateWithoutBrief);

	return {
		...candidateWithoutBrief,
		brief: buildBrief(candidateWithoutBrief, draft),
	};
}

function trendShape(signal: TrendSignalInput): string {
	if (signal.opportunityShape) {
		return signal.opportunityShape;
	}
	if ((signal.monetizationShift ?? 0) >= trendShapeThresholds.monetizationInflection) {
		return "monetization-inflection";
	}
	if ((signal.distributionChange ?? 0) >= trendShapeThresholds.distributionShift) {
		return "distribution-shift";
	}
	if ((signal.categoryAcceleration ?? 0) >= trendShapeThresholds.emergingBehavior) {
		return "emerging-behavior";
	}
	return "underserved-workflow";
}

export function discoverTrendCandidates(signals: TrendSignalInput[] = []): DraftCandidate[] {
	return signals.map((signal, index) => {
		const demand = average([
			signal.chartMomentum,
			signal.categoryAcceleration,
			signal.reviewMomentum,
		]);
		const trendMomentum = average([
			signal.chartMomentum,
			signal.categoryAcceleration,
			signal.reviewMomentum,
			signal.timeSensitivity,
			signal.distributionChange,
		]);
		const durabilityRisk = signal.durability === undefined ? null : 100 - signal.durability;
		const competition = signal.competition ?? average([demand, signal.chartMomentum]);
		const painIntensity = signal.painIntensity ?? average([signal.reviewMomentum, signal.categoryAcceleration]);
		const marketGap = signal.marketGap ?? average([competition === null ? null : 100 - competition, painIntensity, 100 - (signal.distributionChange ?? 50)]);
		const monetizationPotential = signal.monetizationPotential ?? average([signal.monetizationShift, demand]);
		const risk = signal.risk ?? average([signal.timeSensitivity, durabilityRisk]);
		const regionalFit = signal.regionalFit ?? trendDefaults.regionalFit;
		const feasibility = signal.implementationFeasibility ?? trendDefaults.implementationFeasibility;
		const corroboration = clampScore(
			(signal.corroboratingSignals?.length ?? 0) * trendDefaults.corroboratingSignalWeight
			+ (signal.durability ?? trendDefaults.durabilityFallback) * trendDefaults.durabilityCorroborationWeight,
		);

		return {
			id: `trend-${index + 1}-${slugify(signal.label)}`,
			mode: "trend",
			title: signal.label,
			targetUser: signal.targetUser,
			coreProblem: signal.coreProblem,
			appConcept: `Build a focused product around ${signal.coreProblem.toLowerCase()} for ${signal.targetUser.toLowerCase()}.`,
			opportunityShape: trendShape(signal),
			seed: signal.label,
			region: signal.region || "global",
			rawScores: {
				demand,
				competition,
				marketGap,
				painIntensity,
				monetizationPotential,
				trendMomentum,
				regionalFit,
				supplyFreshness: null,
				replacementPressure: null,
				implementationFeasibility: feasibility,
				risk,
			},
			evidenceByDimension: {
				demand: [
					`chart momentum ${clampScore(signal.chartMomentum)}`,
					`category acceleration ${clampScore(signal.categoryAcceleration)}`,
					`review momentum ${clampScore(signal.reviewMomentum)}`,
				],
				competition: [`competition proxy ${clampScore(competition)}`],
				marketGap: [`gap proxy ${clampScore(marketGap)}`],
				painIntensity: [`pain proxy ${clampScore(painIntensity)}`],
				monetizationPotential: [`monetization shift ${clampScore(signal.monetizationShift)}`],
				trendMomentum: [`time sensitivity ${clampScore(signal.timeSensitivity)}`],
				regionalFit: [`regional fit ${clampScore(regionalFit)}`],
				implementationFeasibility: [`feasibility ${clampScore(feasibility)}`],
				risk: [`durability risk ${clampScore(durabilityRisk)}`],
			},
			summaries: {
				demand: `Trend demand is ${describeBand(clampScore(demand))}, driven by chart, category, and review movement.`,
				competition: `Competition is ${describeBand(100 - clampScore(competition))} whitespace for a timing-led idea.`,
				marketGap: `The candidate has ${describeBand(clampScore(marketGap))} whitespace after accounting for problem pressure and distribution change.`,
				painIntensity: `User pain looks ${describeBand(clampScore(painIntensity))} based on review and category signals.`,
				monetizationPotential: `Commercial signal is ${describeBand(clampScore(monetizationPotential))}.`,
				trendMomentum: `Trend momentum is ${describeBand(clampScore(trendMomentum))}; this flow still needs durability validation.`,
				regionalFit: `Regional fit looks ${describeBand(clampScore(regionalFit))}.`,
				implementationFeasibility: `Feasibility is ${describeBand(clampScore(feasibility))} for a first product slice.`,
				risk: `Risk is ${describeBand(clampScore(risk), false)} because trend durability can fade quickly.`,
			},
			corroboration,
			validationIdeas: [
				"Check whether the signal persists across multiple weeks, not just a single spike.",
				"Interview users experiencing the behavior shift behind this trend.",
				"Map the incumbents to see whether timing or UX is the actual opening.",
			],
			riskNotes: [
				"Trend windows can close before product distribution catches up.",
				"Signal strength still needs durability confirmation beyond early momentum.",
			],
		};
	});
}

interface KeywordCluster {
	label: string;
	targetUser: string;
	coreProblem: string;
	narrowness: number;
	segmentType: "broad" | "intent" | "persona" | "workflow";
}

export function expandKeywordClusters(input: KeywordSeedInput): KeywordCluster[] {
	const clusters: KeywordCluster[] = [
		{
			label: input.seed,
			targetUser: input.targetUser,
			coreProblem: input.coreProblem,
			narrowness: 0,
			segmentType: "broad",
		},
	];

	for (const intent of input.intents?.slice(0, 3) || []) {
		clusters.push({
			label: `${input.seed} for ${intent}`,
			targetUser: input.targetUser,
			coreProblem: `${input.coreProblem} during ${intent}`,
			narrowness: 1,
			segmentType: "intent",
		});
	}

	for (const persona of input.personas?.slice(0, 2) || []) {
		clusters.push({
			label: `${input.seed} for ${persona}`,
			targetUser: persona,
			coreProblem: input.coreProblem,
			narrowness: 1,
			segmentType: "persona",
		});
	}

	for (const workflowSlice of input.workflowSlices?.slice(0, 2) || []) {
		clusters.push({
			label: `${workflowSlice} with ${input.seed}`,
			targetUser: input.targetUser,
			coreProblem: workflowSlice,
			narrowness: 1,
			segmentType: "workflow",
		});
	}

	return clusters;
}

function keywordSegmentBonus(cluster: KeywordCluster): number {
	return keywordSegmentBonuses[cluster.segmentType];
}

export function discoverKeywordCandidates(input: KeywordSeedInput | undefined): DraftCandidate[] {
	if (!input) {
		return [];
	}
	const clusters = expandKeywordClusters(input);
	const baseDemand = input.baseDemand ?? keywordDefaults.baseDemand;
	const baseCompetition = input.baseCompetition ?? keywordDefaults.baseCompetition;
	const basePain = input.basePainIntensity ?? keywordDefaults.basePainIntensity;
	const baseMonetization = input.baseMonetizationPotential ?? keywordDefaults.baseMonetizationPotential;
	const baseRegionalFit = input.baseRegionalFit ?? keywordDefaults.baseRegionalFit;

	return clusters.map((cluster, index) => {
		const segmentBonus = keywordSegmentBonus(cluster);
		const demand = clampScore(
			baseDemand
			- cluster.narrowness * keywordSegmentAdjustments.demandNarrownessPenalty
			+ (cluster.segmentType === "intent" ? keywordSegmentAdjustments.intentDemandBonus : 0),
		);
		const competition = clampScore(baseCompetition - segmentBonus);
		const marketGap = clampScore(average([100 - competition, basePain, keywordSegmentAdjustments.marketGapBase + segmentBonus]));
		const painIntensity = clampScore(basePain + (cluster.segmentType === "workflow" ? keywordSegmentAdjustments.workflowPainBonus : 0));
		const monetizationPotential = clampScore(baseMonetization + (cluster.segmentType === "persona" ? keywordSegmentAdjustments.personaMonetizationBonus : 0));
		const trendMomentum = clampScore(average([demand, keywordSegmentAdjustments.trendMomentumBase + segmentBonus]));
		const feasibility = cluster.segmentType === "workflow"
			? keywordSegmentAdjustments.workflowFeasibility
			: keywordSegmentAdjustments.defaultFeasibility;
		const risk = clampScore(average([
			competition,
			100 - marketGap,
			cluster.segmentType === "broad"
				? keywordSegmentAdjustments.broadRiskBase
				: keywordSegmentAdjustments.narrowRiskBase,
		]));
		const corroboration = clampScore(
			keywordSegmentAdjustments.corroborationBase
			+ segmentBonus * keywordSegmentAdjustments.corroborationBonusMultiplier,
		);

		return {
			id: `keyword-${index + 1}-${slugify(cluster.label)}`,
			mode: "keyword",
			title: cluster.label,
			targetUser: cluster.targetUser,
			coreProblem: cluster.coreProblem,
			appConcept: `Deliver a focused workflow for ${cluster.targetUser.toLowerCase()} around ${cluster.coreProblem.toLowerCase()}.`,
			opportunityShape: cluster.segmentType === "broad" ? "broad-demand" : `${cluster.segmentType}-segment`,
			seed: input.seed,
			region: input.region || "global",
			rawScores: {
				demand,
				competition,
				marketGap,
				painIntensity,
				monetizationPotential,
				trendMomentum,
				regionalFit: baseRegionalFit,
				supplyFreshness: null,
				replacementPressure: null,
				implementationFeasibility: feasibility,
				risk,
			},
			evidenceByDimension: {
				demand: [`seed demand ${baseDemand}`, `segment narrowness ${cluster.narrowness}`],
				competition: [`base competition ${baseCompetition}`, `segment bonus ${segmentBonus}`],
				marketGap: [`market gap proxy ${marketGap}`],
				painIntensity: [`pain proxy ${painIntensity}`],
				monetizationPotential: [`monetization proxy ${monetizationPotential}`],
				trendMomentum: [`adjacent intent signal ${trendMomentum}`],
				regionalFit: [`regional fit ${baseRegionalFit}`],
				implementationFeasibility: [`feasibility ${feasibility}`],
				risk: [`saturation risk ${risk}`],
			},
			summaries: {
				demand: `Demand stays ${describeBand(demand)} even after narrowing the seed into a more actionable segment.`,
				competition: `Competition is ${describeBand(100 - competition)} whitespace because the candidate avoids the broadest keyword battle.`,
				marketGap: `The cluster exposes ${describeBand(marketGap)} whitespace versus the broad term.`,
				painIntensity: `Pain intensity is ${describeBand(painIntensity)} for this keyword-led workflow.`,
				monetizationPotential: `Monetization fit looks ${describeBand(monetizationPotential)} for a focused user segment.`,
				trendMomentum: `Momentum is ${describeBand(trendMomentum)}; this is more a demand-structure play than a breakout trend.`,
				regionalFit: `Regional fit is ${describeBand(baseRegionalFit)} based on the supplied market focus.`,
				implementationFeasibility: `Feasibility is ${describeBand(feasibility)} for a first cut.`,
				risk: `Risk is ${describeBand(risk, false)} because broad keywords can still pull attention back toward incumbents.`,
			},
			corroboration,
			validationIdeas: [
				"Validate whether this narrow segment actually searches or converts differently from the parent term.",
				"Review incumbent positioning to confirm the sub-segment is under-served rather than merely under-marketed.",
				"Prototype a landing page that names the segment explicitly and test conversion.",
			],
			riskNotes: [
				"Segment demand may collapse if the niche is too narrow.",
				"Broad incumbents can react quickly if the niche starts converting.",
			],
		};
	});
}

function isReplacementCandidate(app: ReplacementAppInput): boolean {
	const stagnation = app.updateStagnationMonths ?? 0;
	const reviewActivity = app.reviewActivity ?? 0;
	const demandVisibility = app.ongoingDemandVisibility ?? 0;
	return (
		stagnation >= replacementFilterThresholds.minStagnationMonths
		&& (reviewActivity >= replacementFilterThresholds.minReviewActivity || demandVisibility >= replacementFilterThresholds.minDemandVisibility)
	);
}

export function discoverReplacementCandidates(apps: ReplacementAppInput[] = []): DraftCandidate[] {
	return apps.filter(isReplacementCandidate).map((app, index) => {
		const supplyFreshness = clampScore(Math.min(app.uxFreshness ?? 100 - (app.updateStagnationMonths ?? 0) * 3, 100));
		const demand = average([app.ongoingDemandVisibility, app.reviewActivity]);
		const replacementPressure = average([
			app.modernAlternativeRequests,
			app.unresolvedComplaintIntensity,
			app.lockInStrength === undefined ? null : 100 - app.lockInStrength,
		]);
		const marketGap = average([
			supplyFreshness === null ? null : 100 - supplyFreshness,
			replacementPressure,
			app.unresolvedComplaintIntensity,
		]);
		const competition = app.competition ?? replacementDefaults.competition;
		const monetizationPotential = app.monetizationPotential ?? replacementDefaults.monetizationPotential;
		const regionalFit = app.regionalFit ?? replacementDefaults.regionalFit;
		const feasibility = app.implementationFeasibility ?? replacementDefaults.implementationFeasibility;
		const risk = app.risk ?? average([
			app.lockInStrength,
			competition,
			feasibility === null ? null : 100 - feasibility,
		]);
		const corroboration = clampScore(
			average([
				app.reviewActivity,
				app.ongoingDemandVisibility,
				app.modernAlternativeRequests,
			]) ?? MISSING_DIMENSION_FALLBACK_SCORE,
		);

		return {
			id: `replacement-${index + 1}-${slugify(app.appName)}`,
			mode: "replacement",
			title: `${app.appName} replacement opportunity`,
			targetUser: app.targetUser,
			coreProblem: app.coreProblem,
			appConcept: `Ship a modern ${app.category.toLowerCase()} workflow that removes the stale friction users still tolerate today.`,
			opportunityShape: "replacement-upgrade",
			seed: app.appName,
			region: app.region || "global",
			rawScores: {
				demand,
				competition,
				marketGap,
				painIntensity: app.unresolvedComplaintIntensity,
				monetizationPotential,
				trendMomentum: average([app.ongoingDemandVisibility, app.reviewActivity]),
				regionalFit,
				supplyFreshness,
				replacementPressure,
				implementationFeasibility: feasibility,
				risk,
			},
			evidenceByDimension: {
				demand: [`demand visibility ${clampScore(app.ongoingDemandVisibility)}`, `review activity ${clampScore(app.reviewActivity)}`],
				competition: [`competition proxy ${clampScore(competition)}`],
				marketGap: [`stale supply proxy ${clampScore(marketGap)}`],
				painIntensity: [`complaint intensity ${clampScore(app.unresolvedComplaintIntensity)}`],
				monetizationPotential: [`monetization proxy ${clampScore(monetizationPotential)}`],
				trendMomentum: [`continuing user presence ${clampScore(average([app.ongoingDemandVisibility, app.reviewActivity]))}`],
				regionalFit: [`regional fit ${clampScore(regionalFit)}`],
				supplyFreshness: [`ux freshness ${clampScore(supplyFreshness)}`, `stagnation months ${clampScore((app.updateStagnationMonths ?? 0) * 3)}`],
				replacementPressure: [`modern alternative requests ${clampScore(app.modernAlternativeRequests)}`, `lock-in inverse ${clampScore(app.lockInStrength === undefined ? null : 100 - app.lockInStrength)}`],
				implementationFeasibility: [`feasibility ${clampScore(feasibility)}`],
				risk: [`risk proxy ${clampScore(risk)}`],
			},
			summaries: {
				demand: `Demand remains ${describeBand(clampScore(demand))} despite product stagnation.`,
				competition: `Competition is ${describeBand(100 - clampScore(competition))} whitespace after accounting for category incumbents.`,
				marketGap: `Supply-side whitespace is ${describeBand(clampScore(marketGap))} because users still show up while the product ages.`,
				painIntensity: `Pain is ${describeBand(clampScore(app.unresolvedComplaintIntensity))} based on unresolved complaints.`,
				monetizationPotential: `Commercial fit looks ${describeBand(clampScore(monetizationPotential))}.`,
				trendMomentum: `Momentum is ${describeBand(clampScore(average([app.ongoingDemandVisibility, app.reviewActivity])))} because demand still persists.`,
				regionalFit: `Regional fit is ${describeBand(clampScore(regionalFit))}.`,
				supplyFreshness: `Supply freshness is ${describeBand(clampScore(supplyFreshness), false)}; lower freshness is the point of entry for this path.`,
				replacementPressure: `Replacement pressure is ${describeBand(clampScore(replacementPressure))} based on complaint recurrence and switching signals.`,
				implementationFeasibility: `Feasibility is ${describeBand(clampScore(feasibility))} for a modernized alternative.`,
				risk: `Risk is ${describeBand(clampScore(risk), false)} because user inertia can suppress switching even when the incumbent is stale.`,
			},
			corroboration,
			validationIdeas: [
				"Review complaint clusters to confirm that users want a new product rather than minor incumbent improvements.",
				"Test willingness to switch with a migration-focused landing page.",
				"Measure whether stale supply comes from UX decay, pricing, or distribution lock-in.",
			],
			riskNotes: [
				"Existing users may complain loudly yet still resist switching because of habit or stored data.",
				"A stale incumbent can still own distribution despite weak product execution.",
			],
		};
	});
}

export function runWorkflow(request: WorkflowRequest): WorkflowResult {
	const draftCandidates =
		request.mode === "trend"
			? discoverTrendCandidates(request.trendSignals)
			: request.mode === "keyword"
				? discoverKeywordCandidates(request.keywordSeed)
				: discoverReplacementCandidates(request.replacementApps);

	const candidates = draftCandidates
		.map(rankCandidate)
		.sort((left, right) => {
			if (right.decisionTier !== left.decisionTier) {
				return tierSortOrder.indexOf(left.decisionTier) - tierSortOrder.indexOf(right.decisionTier);
			}
			if ((right.highValueModel?.overallScore || 0) !== (left.highValueModel?.overallScore || 0)) {
				return (right.highValueModel?.overallScore || 0) - (left.highValueModel?.overallScore || 0);
			}
			if (right.attractiveness !== left.attractiveness) {
				return right.attractiveness - left.attractiveness;
			}
			return right.confidence - left.confidence;
		})
		.slice(0, request.topN ?? DEFAULT_TOP_N);

	return {
		mode: request.mode,
		generatedAt: new Date().toISOString(),
		candidates,
	};
}
