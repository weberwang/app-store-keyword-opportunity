import type { AppInfo, SuggestionItem } from "../types.js";
export declare function fetchSuggestions(term: string, { country }?: {
    country?: string;
}): Promise<SuggestionItem[]>;
export declare function searchApps(term: string, { country, language, limit, genreId, }?: {
    country?: string;
    language?: string;
    limit?: number;
    genreId?: string;
}): Promise<AppInfo[]>;
export declare function fetchAppDetails(id: string, { country, language, }?: {
    country?: string;
    language?: string;
}): Promise<AppInfo | null>;
