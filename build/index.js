#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import "dotenv/config";
import { registerChartTools } from "./tools/charts.js";
import { registerCountryCompareTools } from "./tools/country-compare.js";
import { registerQueryKeywordTools } from "./tools/query-keywords.js";
import { registerReviewTools } from "./tools/reviews.js";
import { registerSearchKeywordTools } from "./tools/search-keywords.js";
import { registerStrategyTools } from "./tools/strategy.js";
const server = new McpServer({
    name: "app-store-keyword-opportunity",
    version: "0.2.0",
});
registerSearchKeywordTools(server);
registerQueryKeywordTools(server);
registerChartTools(server);
registerReviewTools(server);
registerCountryCompareTools(server);
registerStrategyTools(server);
const transport = new StdioServerTransport();
await server.connect(transport);
//# sourceMappingURL=index.js.map