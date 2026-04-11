import type { ChartApp, ChartTrendResult, KeywordResult, Snapshot, TrendResult } from "../types.js";
export declare const CHART_TYPES: Record<string, {
    key: string;
    label: string;
}>;
export declare function fetchChart(country?: string, chartType?: string, limit?: number, genreId?: string): Promise<ChartApp[]>;
export declare function scoreKeywordAgainstChart(keyword: string, topApps: AppLike[], chartApps: ChartApp[]): TrendResult;
interface AppLike {
    id: string;
    [key: string]: any;
}
interface ChartFetchResult {
    type: string;
    label: string;
    apps: ChartApp[];
    error?: string;
}
export declare function enrichSnapshotWithTrends(snapshot: Snapshot, { country, chartTypes, limit, }?: {
    country?: string;
    chartTypes?: string[];
    limit?: number;
}): Promise<{
    enriched: (KeywordResult & {
        trend: TrendResult;
    })[];
    charts: ChartFetchResult[];
    chartTotal: number;
    fetchedAt: string;
}>;
export declare function compareSnapshots(oldSnapshot: Snapshot, newSnapshot: Snapshot): any[];
export declare function analyzeChartTrends(chartApps: ChartApp[]): ChartTrendResult;
export {};
