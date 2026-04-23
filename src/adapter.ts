import { runWorkflow } from "./core.js";
import type {
	RankedCandidate,
	SkillWorkflowResponse,
	WorkflowRequest,
	WorkflowResult,
} from "./types.js";

export interface WorkflowAdapter<Request, Response> {
	readonly name: string;
	toWorkflowRequest(request: Request): WorkflowRequest;
	fromWorkflowResult(result: WorkflowResult): Response;
}

export interface McpToolResponse {
	content: Array<{ type: "text"; text: string }>;
	structuredContent: WorkflowResult;
	isError?: boolean;
}

function summarizeCandidate(candidate: RankedCandidate): string {
	return [
		`${candidate.title} [${candidate.decisionTier}]`,
		`score=${candidate.attractiveness}, confidence=${candidate.confidence}`,
		candidate.brief.competitiveFraming,
	].join(" | ");
}

export class McpWorkflowAdapter implements WorkflowAdapter<WorkflowRequest, McpToolResponse> {
	readonly name = "mcp";

	toWorkflowRequest(request: WorkflowRequest): WorkflowRequest {
		return request;
	}

	fromWorkflowResult(result: WorkflowResult): McpToolResponse {
		const lines = result.candidates.length
			? result.candidates.map((candidate, index) => `${index + 1}. ${summarizeCandidate(candidate)}`)
			: [`No ${result.mode} candidates cleared the discovery gate.`];
		return {
			content: [{ type: "text", text: lines.join("\n") }],
			structuredContent: result,
			isError: result.candidates.length === 0,
		};
	}

	execute(request: WorkflowRequest): McpToolResponse {
		const result = runWorkflow(this.toWorkflowRequest(request));
		return this.fromWorkflowResult(result);
	}
}

export class SkillWorkflowAdapter implements WorkflowAdapter<WorkflowRequest, SkillWorkflowResponse> {
	readonly name = "skill";

	toWorkflowRequest(request: WorkflowRequest): WorkflowRequest {
		return request;
	}

	fromWorkflowResult(result: WorkflowResult): SkillWorkflowResponse {
		return {
			overview: result.candidates.length
				? `Generated ${result.candidates.length} ${result.mode} candidates. Top tier: ${result.candidates[0]?.decisionTier || "none"}.`
				: `No ${result.mode} candidates surfaced from the supplied evidence.`,
			recommendedPrompts: [
				"Ask for evidence gaps before committing to a build.",
				"Compare top opportunities by confidence and risk, not just opportunity score.",
				"Request a deeper brief for any candidate in pursue-now or validate-next.",
			],
			candidates: result.candidates,
		};
	}
}