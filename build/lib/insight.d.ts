import type { AppInfo, KeywordResult, MarketInsight, ProductStrategy } from "../types.js";
export declare function computeMarketInsight(keyword: string, topApps: AppInfo[]): MarketInsight;
export declare function buildProductStrategy(keywords: KeywordResult[]): ProductStrategy | null;
