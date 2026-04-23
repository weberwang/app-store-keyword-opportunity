import assert from "node:assert/strict";
import test from "node:test";
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