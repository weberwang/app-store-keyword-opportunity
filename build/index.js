#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { McpWorkflowAdapter } from "./adapter.js";
const trendSignalSchema = z.object({
    label: z.string().min(1),
    targetUser: z.string().min(1),
    coreProblem: z.string().min(1),
    region: z.string().optional(),
    chartMomentum: z.number().min(0).max(100).optional(),
    categoryAcceleration: z.number().min(0).max(100).optional(),
    reviewMomentum: z.number().min(0).max(100).optional(),
    monetizationShift: z.number().min(0).max(100).optional(),
    timeSensitivity: z.number().min(0).max(100).optional(),
    distributionChange: z.number().min(0).max(100).optional(),
    competition: z.number().min(0).max(100).optional(),
    painIntensity: z.number().min(0).max(100).optional(),
    marketGap: z.number().min(0).max(100).optional(),
    monetizationPotential: z.number().min(0).max(100).optional(),
    regionalFit: z.number().min(0).max(100).optional(),
    implementationFeasibility: z.number().min(0).max(100).optional(),
    risk: z.number().min(0).max(100).optional(),
    durability: z.number().min(0).max(100).optional(),
    corroboratingSignals: z.array(z.string()).optional(),
    opportunityShape: z.string().optional(),
});
const keywordSeedSchema = z.object({
    seed: z.string().min(1),
    targetUser: z.string().min(1),
    coreProblem: z.string().min(1),
    region: z.string().optional(),
    baseDemand: z.number().min(0).max(100).optional(),
    baseCompetition: z.number().min(0).max(100).optional(),
    basePainIntensity: z.number().min(0).max(100).optional(),
    baseMonetizationPotential: z.number().min(0).max(100).optional(),
    baseRegionalFit: z.number().min(0).max(100).optional(),
    intents: z.array(z.string()).optional(),
    personas: z.array(z.string()).optional(),
    workflowSlices: z.array(z.string()).optional(),
    relatedProblems: z.array(z.string()).optional(),
});
const replacementAppSchema = z.object({
    appName: z.string().min(1),
    category: z.string().min(1),
    targetUser: z.string().min(1),
    coreProblem: z.string().min(1),
    region: z.string().optional(),
    ongoingDemandVisibility: z.number().min(0).max(100).optional(),
    reviewActivity: z.number().min(0).max(100).optional(),
    updateStagnationMonths: z.number().min(0).max(120).optional(),
    uxFreshness: z.number().min(0).max(100).optional(),
    unresolvedComplaintIntensity: z.number().min(0).max(100).optional(),
    modernAlternativeRequests: z.number().min(0).max(100).optional(),
    lockInStrength: z.number().min(0).max(100).optional(),
    monetizationPotential: z.number().min(0).max(100).optional(),
    competition: z.number().min(0).max(100).optional(),
    regionalFit: z.number().min(0).max(100).optional(),
    implementationFeasibility: z.number().min(0).max(100).optional(),
    risk: z.number().min(0).max(100).optional(),
});
const workflowSchema = z
    .object({
    mode: z.enum(["trend", "keyword", "replacement"]),
    topN: z.number().int().min(1).max(10).default(5),
    trendSignals: z.array(trendSignalSchema).default([]),
    keywordSeed: keywordSeedSchema.optional(),
    replacementApps: z.array(replacementAppSchema).default([]),
})
    .superRefine((value, ctx) => {
    if (value.mode === "trend" && value.trendSignals.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "trend mode requires at least one trend signal", path: ["trendSignals"] });
    }
    if (value.mode === "keyword" && !value.keywordSeed) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "keyword mode requires keywordSeed", path: ["keywordSeed"] });
    }
    if (value.mode === "replacement" && value.replacementApps.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "replacement mode requires replacementApps", path: ["replacementApps"] });
    }
});
const server = new McpServer({
    name: "app-topic-discovery-workflow",
    version: "0.3.0",
});
const adapter = new McpWorkflowAdapter();
server.registerTool("discover_app_topics", {
    description: "Discover, score, and brief app topic opportunities across trend, keyword, or replacement discovery paths.",
    inputSchema: workflowSchema,
}, async (input) => {
    const response = adapter.execute(input);
    return {
        ...response,
        structuredContent: response.structuredContent,
    };
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
//# sourceMappingURL=index.js.map