import assert from "node:assert/strict";
import test from "node:test";
import { McpWorkflowAdapter, SkillWorkflowAdapter } from "../adapter.js";
import { runWorkflow } from "../core.js";
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
