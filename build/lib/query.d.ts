import type { KeywordResult, QueryFilters, Snapshot } from "../types.js";
interface ResolvedFilters {
    q: string;
    country: string;
    category: string;
    include: string[];
    requireAll: string[];
    exclude: string[];
    minOpportunity: number | undefined;
    maxCompetition: number | undefined;
    minDemand: number | undefined;
    maxTitleMatches: number | undefined;
    maxMedianReviews: number | undefined;
    limit: number;
    sortBy: string;
}
declare function buildFilters(input?: QueryFilters): ResolvedFilters;
export declare function queryKeywords(snapshot: Snapshot, rawFilters?: QueryFilters): KeywordResult[];
export { buildFilters };
