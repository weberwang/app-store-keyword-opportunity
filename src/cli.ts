#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { McpWorkflowAdapter } from "./adapter.js";
import { sampleRequests } from "./samples.js";
import type { WorkflowRequest } from "./types.js";

const adapter = new McpWorkflowAdapter();

function printUsage(): void {
	console.log(`Usage:
  node build/cli.js sample <trend|keyword|replacement>
  node build/cli.js file <path-to-json>`);
}

async function loadFileRequest(filePath: string): Promise<WorkflowRequest> {
	const text = await readFile(filePath, "utf8");
	return JSON.parse(text) as WorkflowRequest;
}

async function main(): Promise<void> {
	const [command, value] = process.argv.slice(2);
	if (!command) {
		printUsage();
		return;
	}

	const request =
		command === "sample"
			? sampleRequests[value as keyof typeof sampleRequests]
			: command === "file" && value
				? await loadFileRequest(value)
				: undefined;

	if (!request) {
		printUsage();
		process.exitCode = 1;
		return;
	}

	const result = adapter.execute(request);
	console.log(result.content[0]?.text || "No output");
	console.log("\n--- structuredContent ---\n");
	console.log(JSON.stringify(result.structuredContent, null, 2));
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});