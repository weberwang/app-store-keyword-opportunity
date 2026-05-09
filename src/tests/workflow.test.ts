import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runWorkflow } from "../core.js";
import { buildGameHeatAnalysis, buildGameKeywordAnalysis, buildGameTrackAnalysis } from "../lib/game-analysis.js";
import { defaultGameGenreId } from "../lib/game-utils.js";
import {
	buildAppleKeywordSignals,
	buildKeywordCommunitySignals,
	buildKeywordTrendSignals,
	mergeMarketSignals,
} from "../lib/market-signals.js";
import {
	extractAsoProviderSignalsForKeyword,
	loadAsoProviderSignalSnapshot,
	resolveAsoProviderSignalSnapshot,
} from "../lib/provider-snapshot.js";
import { buildHighValueOpportunitySummary } from "../lib/scoring.js";
import { McpWorkflowAdapter, SkillWorkflowAdapter } from "../adapter.js";
import { sampleRequests } from "../samples.js";

test("trend flow produces ranked candidates with briefs", () => {
	const adapter = new McpWorkflowAdapter();
	const result = adapter.execute(sampleRequests.trend);
	assert.equal(result.isError, false);
	assert.ok(result.structuredContent.candidates.length >= 1);
	assert.equal(result.structuredContent.candidates[0]?.mode, "trend");
	assert.ok(result.structuredContent.candidates[0]?.brief.evidenceTrace.length);
});

test("keyword flow promotes a narrower segment over the broad term", () => {
	const adapter = new McpWorkflowAdapter();
	const result = adapter.execute(sampleRequests.keyword);
	assert.equal(result.isError, false);
	assert.ok(result.structuredContent.candidates.length >= 2);
	assert.notEqual(result.structuredContent.candidates[0]?.title, "habit tracker");
	assert.ok(result.structuredContent.candidates.some((candidate) => candidate.title.includes("for") || candidate.title.includes("with")));
	assert.ok((result.structuredContent.candidates[0]?.highValueModel?.overallScore || 0) >= (result.structuredContent.candidates[1]?.highValueModel?.overallScore || 0));
});

test("replacement flow filters abandoned dead ends and scores stale supply explicitly", () => {
	const adapter = new McpWorkflowAdapter();
	const result = adapter.execute(sampleRequests.replacement);
	assert.equal(result.isError, false);
	assert.equal(result.structuredContent.candidates.length, 1);
	const candidate = result.structuredContent.candidates[0];
	assert.equal(candidate?.mode, "replacement");
	assert.ok(candidate?.evidence.supplyFreshness.score !== undefined);
	assert.ok(candidate?.evidence.replacementPressure.score !== undefined);
});

test("skill adapter reuses the same workflow contract", () => {
	const adapter = new SkillWorkflowAdapter();
	const response = adapter.fromWorkflowResult({
		mode: "trend",
		generatedAt: new Date().toISOString(),
		candidates: new McpWorkflowAdapter().execute(sampleRequests.trend).structuredContent.candidates,
	});
	assert.ok(response.overview.includes("Generated"));
	assert.equal(response.recommendedPrompts.length, 3);
});

// ── 边界测试 ──────────────────────────────────────────────────────────────────

test("trend flow with empty signals returns empty candidates", () => {
	const result = runWorkflow({ mode: "trend", trendSignals: [] });
	assert.equal(result.mode, "trend");
	assert.equal(result.candidates.length, 0);
});

test("keyword flow with no keywordSeed returns empty candidates", () => {
	const result = runWorkflow({ mode: "keyword" });
	assert.equal(result.mode, "keyword");
	assert.equal(result.candidates.length, 0);
});

test("replacement flow with empty apps returns empty candidates", () => {
	const result = runWorkflow({ mode: "replacement", replacementApps: [] });
	assert.equal(result.mode, "replacement");
	assert.equal(result.candidates.length, 0);
});

test("topN limits the number of returned candidates", () => {
	const result = runWorkflow({
		mode: "keyword",
		topN: 2,
		keywordSeed: {
			seed: "meditation",
			targetUser: "stressed adults",
			coreProblem: "managing daily stress",
			intents: ["sleep", "focus", "anxiety"],
			personas: ["parents", "students"],
			workflowSlices: ["morning routine", "evening wind-down"],
		},
	});
	assert.ok(result.candidates.length <= 2);
});

test("topN of 1 returns at most 1 candidate", () => {
	const result = runWorkflow({
		mode: "trend",
		topN: 1,
		trendSignals: [
			{
				label: "Signal A",
				targetUser: "user A",
				coreProblem: "problem A",
				chartMomentum: 80,
				categoryAcceleration: 75,
			},
			{
				label: "Signal B",
				targetUser: "user B",
				coreProblem: "problem B",
				chartMomentum: 70,
				categoryAcceleration: 65,
			},
		],
	});
	assert.equal(result.candidates.length, 1);
});

test("missing evidence dimensions use neutral fallback score of 50", () => {
	// Trend signal with no optional fields → supplyFreshness and replacementPressure are null
	const result = runWorkflow({
		mode: "trend",
		trendSignals: [
			{
				label: "Minimal signal",
				targetUser: "anyone",
				coreProblem: "some problem",
			},
		],
	});
	assert.equal(result.candidates.length, 1);
	const candidate = result.candidates[0]!;
	// supplyFreshness and replacementPressure have no raw score → missing=true, score=50
	assert.equal(candidate.evidence.supplyFreshness.missing, true);
	assert.equal(candidate.evidence.supplyFreshness.score, 50);
	assert.equal(candidate.evidence.replacementPressure.missing, true);
	assert.equal(candidate.evidence.replacementPressure.score, 50);
});

test("missing dimension summary contains fallback text", () => {
	const result = runWorkflow({
		mode: "trend",
		trendSignals: [
			{
				label: "Sparse signal",
				targetUser: "anyone",
				coreProblem: "some problem",
			},
		],
	});
	const candidate = result.candidates[0]!;
	assert.ok(candidate.evidence.supplyFreshness.summary.includes("neutral baseline"));
});

test("replacement filter: app below stagnation threshold is excluded", () => {
	// stagnation < 6 months → should be filtered out
	const result = runWorkflow({
		mode: "replacement",
		replacementApps: [
			{
				appName: "Fresh App",
				category: "tools",
				targetUser: "users",
				coreProblem: "some problem",
				updateStagnationMonths: 3,
				reviewActivity: 80,
				ongoingDemandVisibility: 80,
			},
		],
	});
	assert.equal(result.candidates.length, 0);
});

test("replacement filter: app with stagnation >= 6 and reviewActivity >= 25 is included", () => {
	const result = runWorkflow({
		mode: "replacement",
		replacementApps: [
			{
				appName: "Stale App",
				category: "tools",
				targetUser: "users",
				coreProblem: "some problem",
				updateStagnationMonths: 12,
				reviewActivity: 30,
				ongoingDemandVisibility: 20,
			},
		],
	});
	assert.equal(result.candidates.length, 1);
	assert.ok(result.candidates[0]?.title.includes("Stale App"));
});

test("replacement filter: app with stagnation >= 6 and demandVisibility >= 35 is included even with low reviewActivity", () => {
	const result = runWorkflow({
		mode: "replacement",
		replacementApps: [
			{
				appName: "Demand App",
				category: "tools",
				targetUser: "users",
				coreProblem: "some problem",
				updateStagnationMonths: 10,
				reviewActivity: 10,
				ongoingDemandVisibility: 40,
			},
		],
	});
	assert.equal(result.candidates.length, 1);
});

test("replacement filter: app with stagnation >= 6 but both reviewActivity < 25 and demandVisibility < 35 is excluded", () => {
	const result = runWorkflow({
		mode: "replacement",
		replacementApps: [
			{
				appName: "Dead App",
				category: "tools",
				targetUser: "users",
				coreProblem: "some problem",
				updateStagnationMonths: 24,
				reviewActivity: 10,
				ongoingDemandVisibility: 20,
			},
		],
	});
	assert.equal(result.candidates.length, 0);
});

test("candidates are sorted: tier order takes priority over attractiveness", () => {
	// Use keyword mode with enough clusters to get multiple tiers
	const result = runWorkflow({
		mode: "keyword",
		topN: 10,
		keywordSeed: {
			seed: "fitness",
			targetUser: "gym goers",
			coreProblem: "tracking workouts",
			baseDemand: 80,
			baseCompetition: 30,
			basePainIntensity: 75,
			baseMonetizationPotential: 70,
			intents: ["weight loss", "muscle gain"],
			personas: ["beginners"],
			workflowSlices: ["post-workout log"],
		},
	});
	// Verify tier ordering: no candidate with a lower-priority tier appears before a higher-priority one
	const tierOrder = ["pursue-now", "validate-next", "monitor", "discard"];
	for (let i = 0; i < result.candidates.length - 1; i++) {
		const currentTierIdx = tierOrder.indexOf(result.candidates[i]!.decisionTier);
		const nextTierIdx = tierOrder.indexOf(result.candidates[i + 1]!.decisionTier);
		assert.ok(currentTierIdx <= nextTierIdx, `Tier ordering violated at index ${i}: ${result.candidates[i]!.decisionTier} before ${result.candidates[i + 1]!.decisionTier}`);
	}
});

test("within same tier, candidates are sorted by attractiveness descending", () => {
	const result = runWorkflow({
		mode: "keyword",
		topN: 10,
		keywordSeed: {
			seed: "fitness",
			targetUser: "gym goers",
			coreProblem: "tracking workouts",
			baseDemand: 80,
			baseCompetition: 30,
			basePainIntensity: 75,
			baseMonetizationPotential: 70,
			intents: ["weight loss", "muscle gain"],
			personas: ["beginners"],
			workflowSlices: ["post-workout log"],
		},
	});
	const tierOrder = ["pursue-now", "validate-next", "monitor", "discard"];
	for (let i = 0; i < result.candidates.length - 1; i++) {
		const a = result.candidates[i]!;
		const b = result.candidates[i + 1]!;
		if (tierOrder.indexOf(a.decisionTier) === tierOrder.indexOf(b.decisionTier)) {
			assert.ok(a.attractiveness >= b.attractiveness, `Attractiveness ordering violated: ${a.attractiveness} < ${b.attractiveness}`);
		}
	}
});

test("keyword broad segment has lower attractiveness than narrower segments", () => {
	const result = runWorkflow({
		mode: "keyword",
		topN: 10,
		keywordSeed: {
			seed: "meditation",
			targetUser: "stressed adults",
			coreProblem: "managing daily stress",
			baseDemand: 70,
			baseCompetition: 70,
			basePainIntensity: 65,
			intents: ["sleep"],
			personas: ["parents"],
		},
	});
	const broadCandidate = result.candidates.find((c) => c.title === "meditation");
	const narrowCandidates = result.candidates.filter((c) => c.title !== "meditation");
	if (broadCandidate && narrowCandidates.length > 0) {
		const maxNarrowAttractiveness = Math.max(...narrowCandidates.map((c) => c.attractiveness));
		assert.ok(broadCandidate.attractiveness <= maxNarrowAttractiveness, "Broad segment should not outrank all narrow segments");
	}
});

test("evidence trace is non-empty for all modes", () => {
	for (const mode of ["trend", "keyword", "replacement"] as const) {
		const result = runWorkflow(sampleRequests[mode]);
		for (const candidate of result.candidates) {
			assert.ok(candidate.brief.evidenceTrace.length > 0, `evidenceTrace empty for mode=${mode}`);
		}
	}
});

test("all candidates have valid attractiveness and confidence in [0, 100]", () => {
	for (const mode of ["trend", "keyword", "replacement"] as const) {
		const result = runWorkflow(sampleRequests[mode]);
		for (const candidate of result.candidates) {
			assert.ok(candidate.attractiveness >= 0 && candidate.attractiveness <= 100);
			assert.ok(candidate.confidence >= 0 && candidate.confidence <= 100);
		}
	}
});

test("all candidates have a valid decisionTier", () => {
	const validTiers = new Set(["pursue-now", "validate-next", "monitor", "discard"]);
	for (const mode of ["trend", "keyword", "replacement"] as const) {
		const result = runWorkflow(sampleRequests[mode]);
		for (const candidate of result.candidates) {
			assert.ok(validTiers.has(candidate.decisionTier), `Invalid tier: ${candidate.decisionTier}`);
		}
	}
});
test("signal fusion preserves provenance and lowers confidence when optional providers are missing", () => {
	const apps = [
		{
			id: "1",
			title: "Habit Flow",
			developer: "Acme",
			score: 4.8,
			reviews: 4200,
			price: 0,
			formattedPrice: "Free",
			free: true,
			genre: "Productivity",
			updatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
		},
		{
			id: "2",
			title: "Habit Sprint",
			developer: "Beta",
			score: 4.4,
			reviews: 980,
			price: 4.99,
			formattedPrice: "$4.99",
			free: false,
			genre: "Productivity",
			updatedAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(),
		},
	] as any;
	const appleSignals = buildAppleKeywordSignals("habit tracker", "us", apps);
	const { signals, coverage } = mergeMarketSignals([appleSignals], {
		expectedSources: ["apple-public", "community", "trend"],
	});
	assert.ok(signals.length >= 3);
	assert.deepEqual(coverage.availableSources, ["apple-public"]);
	assert.ok(coverage.missingSources.includes("community"));
	assert.ok(!coverage.missingSources.includes("aso-provider" as any));
	const highValue = buildHighValueOpportunitySummary({
		title: "habit tracker",
		demand: 68,
		competition: 74,
		marketGap: 55,
		monetizationPotential: 52,
		implementationFeasibility: 60,
		risk: 48,
		trendMomentum: 50,
		painIntensity: 58,
		signalCoverage: coverage,
		signals,
	});
	assert.ok(highValue.dimensions.evidenceConfidence.score < coverage.averageConfidence);
	assert.ok(highValue.missingEvidenceSources.includes("community"));
});

test("keyword signal acquisition can fill community and trend coverage from existing collectors", () => {
	const apps = [
		{
			id: "1",
			title: "Habit Flow",
			developer: "Acme",
			score: 4.8,
			reviews: 4200,
			price: 0,
			formattedPrice: "Free",
			free: true,
			genre: "Productivity",
			updatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
		},
		{
			id: "2",
			title: "Habit Sprint",
			developer: "Beta",
			score: 4.4,
			reviews: 980,
			price: 4.99,
			formattedPrice: "$4.99",
			free: false,
			genre: "Productivity",
			updatedAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(),
		},
	] as any;
	const appleSignals = buildAppleKeywordSignals("habit tracker", "us", apps);
	const communitySignals = buildKeywordCommunitySignals("habit tracker", "us", [
		{
			appId: "1",
			title: "Habit Flow",
			reviews: [
				{ id: "r1", title: "Need export", content: "Please add export and sync", rating: 2, author: "a" },
				{ id: "r2", title: "Solid", content: "Great widget and routine flow", rating: 5, author: "b" },
			],
		},
	]);
	const trendSignals = buildKeywordTrendSignals("habit tracker", "us", apps, [
		{ ...apps[0], rank: 3, chartType: "top-free" },
		{ ...apps[1], rank: 8, chartType: "new-apps" },
	] as any);
	const { coverage } = mergeMarketSignals([appleSignals, communitySignals, trendSignals], {
		expectedSources: ["apple-public", "community", "trend"],
	});
	assert.ok(communitySignals.length >= 2);
	assert.ok(trendSignals.length >= 2);
	assert.deepEqual([...coverage.availableSources].sort(), ["apple-public", "community", "trend"]);
	assert.deepEqual(coverage.missingSources, []);
});

test("ASO snapshot entrypoint can import matching keyword and app signals", async () => {
	const dir = await mkdtemp(join(tmpdir(), "aso-snapshot-"));
	const filePath = join(dir, "provider-signals.json");
	await writeFile(
		filePath,
		JSON.stringify({
			providerId: "mock-aso",
			generatedAt: new Date().toISOString(),
			signals: [
				{
					entityKind: "keyword",
					entityId: "habit tracker",
					metric: "keyword-volume",
					value: 82,
					territory: "us",
					confidence: 76,
					isEstimated: true,
					rawMetricKey: "search_volume",
					rawValue: 14200,
				},
				{
					entityKind: "app",
					entityId: "1",
					entityLabel: "Habit Flow",
					metric: "download-estimate",
					value: 64,
					territory: "us",
					confidence: 70,
					isEstimated: true,
					rawMetricKey: "downloads_estimate",
					rawValue: 32000,
				},
			],
		}),
		"utf8",
	);

	const loaded = await loadAsoProviderSignalSnapshot(filePath);
	assert.equal(loaded.configured, true);
	assert.equal(loaded.warnings.length, 0);

	const apps = [
		{
			id: "1",
			title: "Habit Flow",
			developer: "Acme",
			score: 4.8,
			reviews: 4200,
			price: 0,
			formattedPrice: "Free",
			free: true,
			genre: "Productivity",
			updatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
		},
	] as any;
	const asoSignals = extractAsoProviderSignalsForKeyword(loaded.snapshot, {
		term: "habit tracker",
		country: "us",
		apps,
	});
	assert.equal(asoSignals.length, 2);
	assert.ok(asoSignals.every((signal) => signal.metadata.source === "aso-provider"));

	const { coverage } = mergeMarketSignals([buildAppleKeywordSignals("habit tracker", "us", apps), asoSignals], {
		expectedSources: ["apple-public", "aso-provider"],
	});
	assert.deepEqual([...coverage.availableSources].sort(), ["apple-public", "aso-provider"]);
	assert.deepEqual(coverage.missingSources, []);

	await rm(dir, { recursive: true, force: true });
});

test("game track analysis summarizes concentration live-ops and review pain points", () => {
	const now = Date.now();
	const topFree = [
		{
			id: "g1",
			title: "Dragon Arena",
			developer: "Studio A",
			score: 4.7,
			reviews: 120000,
			price: 0,
			formattedPrice: "Free",
			free: true,
			genre: "Games",
			genreId: defaultGameGenreId,
			updatedAt: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
			rank: 1,
			chartType: "top-free",
		},
		{
			id: "g2",
			title: "Dragon Arena Legends",
			developer: "Studio A",
			score: 4.6,
			reviews: 88000,
			price: 0,
			formattedPrice: "Free",
			free: true,
			genre: "Games",
			genreId: defaultGameGenreId,
			updatedAt: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
			rank: 2,
			chartType: "top-free",
		},
	] as any;
	const topPaid = [
		{
			id: "g1",
			title: "Dragon Arena",
			developer: "Studio A",
			score: 4.7,
			reviews: 120000,
			price: 4.99,
			formattedPrice: "$4.99",
			free: false,
			genre: "Games",
			genreId: defaultGameGenreId,
			updatedAt: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
			rank: 1,
			chartType: "top-paid",
		},
	] as any;
	const newApps = [
		{
			id: "g3",
			title: "Pixel Tactics",
			developer: "Studio B",
			score: 4.4,
			reviews: 2400,
			price: 0,
			formattedPrice: "Free",
			free: true,
			genre: "Games",
			genreId: defaultGameGenreId,
			updatedAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
			rank: 3,
			chartType: "new-apps",
		},
	] as any;

	const analysis = buildGameTrackAnalysis({
		country: "us",
		genreId: defaultGameGenreId,
		charts: {
			topFree,
			topPaid,
			newApps,
			warnings: [],
		},
		reviewSummary: {
			reviewsFetched: 120,
			appSummaries: [
				{
					appId: "g1",
					title: "Dragon Arena",
					reviewsFetched: 60,
					averageRating: 4.2,
					topPainPoints: ["ads", "matchmaking"],
					topSellingPoints: ["events", "guild"],
				},
			],
			painPoints: [
				{ term: "ads", count: 12 },
				{ term: "matchmaking", count: 9 },
			],
			sellingPoints: [
				{ term: "events", count: 11 },
			],
			ratingHistogram: { 1: 6, 2: 10, 3: 18, 4: 44, 5: 42 },
			totalRatings: 120,
		},
	});

	assert.equal(analysis.genreId, defaultGameGenreId);
	assert.ok(analysis.market.publisherConcentration.leaderShare >= 50);
	assert.ok(analysis.market.crossChartLeaders.length >= 1);
	assert.ok(analysis.reviewSignals?.painPoints[0]?.term === "ads");
	assert.ok(analysis.insights.some((item) => item.includes("头部厂商")));
	assert.ok(analysis.insights.some((item) => item.includes("live-ops") || item.includes("更新节奏")));
});

test("game keyword analysis groups demand competition and whitespace lenses", () => {
	const snapshot = {
		meta: {
			generatedAt: new Date().toISOString(),
			country: "us",
			language: "en-us",
			seeds: ["idle rpg"],
			totalKeywords: 3,
			genreId: defaultGameGenreId,
			sourceCoverage: [
				{ providerId: "apple-public-search", source: "apple-public", available: true, freshnessHours: 0, averageConfidence: 70, estimatedMetricCount: 2 },
			],
		},
		keywords: [
			{
				term: "idle rpg offline",
				seeds: ["idle rpg"],
				country: "us",
				opportunityScore: 66,
				demandScore: 74,
				competitionScore: 38,
				monetizationScore: 41,
				marketGapScore: 59,
				relevanceScore: 78,
				topApps: [{ id: "1", title: "Idle Quest", developer: "Studio A", score: 4.7, reviews: 12000, price: 0, formattedPrice: "Free", free: true, genre: "Games", genreId: defaultGameGenreId }],
				metrics: { exactTitleMatches: 0, partialTitleMatches: 1, medianReviewCount: 12000, avgRating: 4.7, paidRatio: 20, resultCount: 30 },
				signalCoverage: { availableSources: ["apple-public"], missingSources: [], averageConfidence: 70, includesEstimatedValues: true },
				highValueSummary: {
					overallScore: 61,
					dimensions: {
						demandDurability: { score: 68, summary: "", evidence: [], signalMetrics: [], missing: false },
						supplyWeakness: { score: 64, summary: "", evidence: [], signalMetrics: [], missing: false },
						monetizationEvidence: { score: 52, summary: "", evidence: [], signalMetrics: [], missing: false },
						entryFeasibility: { score: 60, summary: "", evidence: [], signalMetrics: [], missing: false },
						evidenceConfidence: { score: 58, summary: "", evidence: [], signalMetrics: [], missing: false },
					},
					buildRecommendation: "",
					strongestSignals: [],
					blockers: [],
					missingEvidenceSources: [],
				},
			},
			{
				term: "idle rpg gacha",
				seeds: ["idle rpg"],
				country: "us",
				opportunityScore: 52,
				demandScore: 79,
				competitionScore: 71,
				monetizationScore: 46,
				marketGapScore: 34,
				relevanceScore: 70,
				topApps: [],
				metrics: { exactTitleMatches: 2, partialTitleMatches: 5, medianReviewCount: 46000, avgRating: 4.6, paidRatio: 34, resultCount: 42 },
				signalCoverage: { availableSources: ["apple-public"], missingSources: [], averageConfidence: 70, includesEstimatedValues: true },
				highValueSummary: {
					overallScore: 44,
					dimensions: {
						demandDurability: { score: 73, summary: "", evidence: [], signalMetrics: [], missing: false },
						supplyWeakness: { score: 32, summary: "", evidence: [], signalMetrics: [], missing: false },
						monetizationEvidence: { score: 58, summary: "", evidence: [], signalMetrics: [], missing: false },
						entryFeasibility: { score: 35, summary: "", evidence: [], signalMetrics: [], missing: false },
						evidenceConfidence: { score: 56, summary: "", evidence: [], signalMetrics: [], missing: false },
					},
					buildRecommendation: "",
					strongestSignals: [],
					blockers: [],
					missingEvidenceSources: [],
				},
			},
			{
				term: "idle rpg merge",
				seeds: ["idle rpg"],
				country: "us",
				opportunityScore: 57,
				demandScore: 66,
				competitionScore: 42,
				monetizationScore: 29,
				marketGapScore: 61,
				relevanceScore: 68,
				topApps: [],
				metrics: { exactTitleMatches: 0, partialTitleMatches: 1, medianReviewCount: 7800, avgRating: 4.5, paidRatio: 10, resultCount: 24 },
				signalCoverage: { availableSources: ["apple-public"], missingSources: [], averageConfidence: 70, includesEstimatedValues: true },
				highValueSummary: {
					overallScore: 58,
					dimensions: {
						demandDurability: { score: 61, summary: "", evidence: [], signalMetrics: [], missing: false },
						supplyWeakness: { score: 67, summary: "", evidence: [], signalMetrics: [], missing: false },
						monetizationEvidence: { score: 40, summary: "", evidence: [], signalMetrics: [], missing: false },
						entryFeasibility: { score: 59, summary: "", evidence: [], signalMetrics: [], missing: false },
						evidenceConfidence: { score: 55, summary: "", evidence: [], signalMetrics: [], missing: false },
					},
					buildRecommendation: "",
					strongestSignals: [],
					blockers: [],
					missingEvidenceSources: [],
				},
			},
		],
	};

	const analysis = buildGameKeywordAnalysis(snapshot as any, { limit: 2 });
	assert.equal(analysis.genreId, defaultGameGenreId);
	assert.equal(analysis.topOpportunities.length, 2);
	assert.ok(analysis.keywordLenses.lowCompetition.includes("idle rpg offline"));
	assert.ok(analysis.keywordLenses.buildableWhitespace.includes("idle rpg merge"));
	assert.ok(analysis.insights.length >= 1);
});

test("game heat analysis surfaces hot subgenres and rising games", () => {
	const charts = {
		topFree: [
			{ id: "g1", title: "Dragon Arena", developer: "Studio A", score: 4.7, reviews: 120000, price: 0, formattedPrice: "Free", free: true, genre: "Strategy", genreId: "7017", updatedAt: new Date().toISOString(), rank: 1, chartType: "top-free" },
			{ id: "g2", title: "Merge Tavern", developer: "Studio B", score: 4.5, reviews: 8000, price: 0, formattedPrice: "Free", free: true, genre: "Puzzle", genreId: "7012", updatedAt: new Date().toISOString(), rank: 5, chartType: "top-free" },
		],
		topPaid: [
			{ id: "g1", title: "Dragon Arena", developer: "Studio A", score: 4.7, reviews: 120000, price: 4.99, formattedPrice: "$4.99", free: false, genre: "Strategy", genreId: "7017", updatedAt: new Date().toISOString(), rank: 2, chartType: "top-paid" },
		],
		newApps: [
			{ id: "g3", title: "Pixel Tactics", developer: "Studio C", score: 4.4, reviews: 2200, price: 0, formattedPrice: "Free", free: true, genre: "Strategy", genreId: "7017", updatedAt: new Date().toISOString(), rank: 3, chartType: "new-apps" },
		],
		warnings: [],
	};

	const analysis = buildGameHeatAnalysis({
		country: "us",
		genreId: defaultGameGenreId,
		charts: charts as any,
	});

	assert.equal(analysis.genreId, defaultGameGenreId);
	assert.ok(analysis.hotSubgenres[0]?.genre === "Strategy");
	assert.ok(analysis.risingGames.some((item) => item.title === "Pixel Tactics"));
	assert.ok(analysis.publisherMomentum.some((item) => item.developer === "Studio A"));
	assert.ok(analysis.titleTerms.length >= 1);
});

test("inline ASO snapshot object can be passed directly without a file", async () => {
	const resolved = await resolveAsoProviderSignalSnapshot({
		snapshot: {
			providerId: "inline-aso",
			generatedAt: new Date().toISOString(),
			signals: [
				{
					entityKind: "keyword",
					entityId: "habit tracker",
					metric: "keyword-volume",
					value: 78,
					territory: "us",
					confidence: 72,
					isEstimated: true,
				},
			],
		},
	});
	assert.equal(resolved.configured, true);
	assert.equal(resolved.warnings.length, 0);
	const apps = [
		{
			id: "1",
			title: "Habit Flow",
			developer: "Acme",
			score: 4.8,
			reviews: 4200,
			price: 0,
			formattedPrice: "Free",
			free: true,
			genre: "Productivity",
			updatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
		},
	] as any;
	const asoSignals = extractAsoProviderSignalsForKeyword(resolved.snapshot, {
		term: "habit tracker",
		country: "us",
		apps,
	});
	assert.equal(asoSignals.length, 1);
	assert.equal(asoSignals[0]?.metadata.providerId, "inline-aso");
});

test("briefing covers pursue-now validate-next monitor and discard outcomes", () => {
	const scenarios: Array<{ expected: string; signal: any }> = [
		{
			expected: "pursue-now",
			signal: {
				label: "AI meal coach",
				targetUser: "busy professionals",
				coreProblem: "planning meals without manual tracking",
				chartMomentum: 96,
				categoryAcceleration: 92,
				reviewMomentum: 90,
				monetizationShift: 88,
				timeSensitivity: 20,
				distributionChange: 35,
				competition: 18,
				painIntensity: 86,
				marketGap: 92,
				monetizationPotential: 86,
				regionalFit: 82,
				implementationFeasibility: 80,
				risk: 20,
				durability: 95,
				corroboratingSignals: ["chart uptrend", "review praise", "creator coverage", "retention stories", "strong pricing"],
			},
		},
		{
			expected: "validate-next",
			signal: {
				label: "async creator coach",
				targetUser: "solo creators",
				coreProblem: "getting feedback without agency retainers",
				chartMomentum: 72,
				categoryAcceleration: 68,
				reviewMomentum: 62,
				monetizationShift: 58,
				timeSensitivity: 50,
				distributionChange: 48,
				competition: 48,
				painIntensity: 68,
				marketGap: 64,
				monetizationPotential: 56,
				regionalFit: 70,
				implementationFeasibility: 60,
				risk: 52,
				durability: 65,
				corroboratingSignals: ["creator forums", "tool bundling"],
			},
		},
		{
			expected: "monitor",
			signal: {
				label: "quiet budgeting buddy",
				targetUser: "new budgeters",
				coreProblem: "building a weekly check-in habit",
				chartMomentum: 55,
				categoryAcceleration: 52,
				reviewMomentum: 45,
				monetizationShift: 42,
				timeSensitivity: 58,
				distributionChange: 44,
				competition: 60,
				painIntensity: 52,
				marketGap: 46,
				monetizationPotential: 44,
				regionalFit: 64,
				implementationFeasibility: 58,
				risk: 58,
				durability: 48,
				corroboratingSignals: ["niche blogs"],
			},
		},
		{
			expected: "discard",
			signal: {
				label: "viral planner gimmick",
				targetUser: "general productivity users",
				coreProblem: "making planning feel trendy",
				chartMomentum: 38,
				categoryAcceleration: 35,
				reviewMomentum: 22,
				monetizationShift: 25,
				timeSensitivity: 70,
				distributionChange: 30,
				competition: 82,
				painIntensity: 40,
				marketGap: 24,
				monetizationPotential: 28,
				regionalFit: 55,
				implementationFeasibility: 42,
				risk: 84,
				durability: 25,
				corroboratingSignals: [],
			},
		},
	];

	for (const scenario of scenarios) {
		const candidate = runWorkflow({
			mode: "trend",
			topN: 1,
			trendSignals: [scenario.signal],
		}).candidates[0];
		assert.equal(candidate?.decisionTier, scenario.expected);
		assert.ok(candidate?.brief.buildThesis);
		assert.ok(candidate?.brief.nextValidationSteps.length);
		if (scenario.expected === "discard") {
			assert.ok(candidate?.brief.rejectionReasons.length);
		}
		if (scenario.expected !== "pursue-now") {
			assert.ok((candidate?.brief.blockers?.length || 0) + (candidate?.brief.confidenceGaps?.length || 0) > 0);
		}
	}
});
