import type { CountryCompareResult } from "../types.js";
export declare function compareAcrossCountries(terms: string[], countries: string[], { language, limit, genreId, concurrency }?: {
    language?: string;
    limit?: number;
    genreId?: string;
    concurrency?: number;
}): Promise<CountryCompareResult>;
