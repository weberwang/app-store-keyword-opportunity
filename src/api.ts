export { runWorkflow, discoverTrendCandidates, discoverKeywordCandidates, discoverReplacementCandidates, expandKeywordClusters } from "./core.js";
export { McpWorkflowAdapter, SkillWorkflowAdapter } from "./adapter.js";
export { sampleRequests } from "./samples.js";
export type {
	DecisionTier,
	DimensionAssessment,
	DimensionMap,
	DiscoveryMode,
	EvidenceDimension,
	EvidenceTrace,
	KeywordSeedInput,
	OpportunityBrief,
	RankedCandidate,
	ReplacementAppInput,
	SkillWorkflowResponse,
	TrendSignalInput,
	WorkflowRequest,
	WorkflowResult,
} from "./types.js";