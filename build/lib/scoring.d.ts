import type { AppInfo, CompetitionMetrics, DemandInput, OpportunityInput } from "../types.js";
export declare function computeRelevanceScore(term: string, seeds: string[]): number;
export declare function computeDemandScore({ bestRank, suggestionCount, resultCount, }: DemandInput): number;
export declare function computeCompetitionScore(keyword: string, topApps: AppInfo[]): {
    competitionScore: number;
    metrics: CompetitionMetrics;
};
export declare function computeOpportunityScore({ demandScore, competitionScore, relevanceScore, }: OpportunityInput): number;
