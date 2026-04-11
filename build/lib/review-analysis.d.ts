import type { ReviewAnalysisResult } from "../types.js";
export declare function analyzeCompetitorReviews(apps: Array<{
    id: string;
    title: string;
}>, { country, pages }?: {
    country?: string;
    pages?: number;
}): Promise<ReviewAnalysisResult>;
