import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runWorkflow } from "../core.js";
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