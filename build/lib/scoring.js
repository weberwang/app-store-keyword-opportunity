import { normalizeTerm, overlapRatio } from "./text.js";
function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, value));
}
function round(value) {
    return Math.round(value * 100) / 100;
}
function average(numbers) {
    if (!numbers.length)
        return 0;
    return numbers.reduce((sum, item) => sum + item, 0) / numbers.length;
}
function median(numbers) {
    if (!numbers.length)
        return 0;
    const sorted = [...numbers].sort((l, r) => l - r);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
}
function logScale(value, maxReference) {
    return clamp(Math.log1p(Math.max(0, value)) / Math.log1p(maxReference));
}
function titleContainsWholeKeyword(title, keyword) {
    const t = normalizeTerm(title);
    const k = normalizeTerm(keyword);
    if (!t || !k)
        return false;
    return (t === k ||
        t.startsWith(`${k} `) ||
        t.endsWith(` ${k}`) ||
        t.includes(` ${k} `));
}
export function computeRelevanceScore(term, seeds) {
    const best = seeds.reduce((cur, seed) => Math.max(cur, overlapRatio(term, seed)), 0);
    return round(best * 100);
}
export function computeDemandScore({ bestRank, suggestionCount, resultCount, }) {
    const rankScore = bestRank ? clamp(1 - (bestRank - 1) / 7) : 0.15;
    const presenceScore = clamp(suggestionCount / 4);
    const searchCoverageScore = clamp(resultCount / 50);
    return round(100 * (0.6 * rankScore + 0.25 * presenceScore + 0.15 * searchCoverageScore));
}
function adjustedReviews(app) {
    const reviews = Number(app.reviews || 0);
    return app.free === false ? reviews * 2 : reviews;
}
export function computeCompetitionScore(keyword, topApps) {
    const reviewCounts = topApps
        .map(adjustedReviews)
        .filter((v) => Number.isFinite(v) && v >= 0);
    const top3ReviewSum = topApps
        .slice(0, 3)
        .reduce((sum, app) => sum + adjustedReviews(app), 0);
    const top3Ratings = topApps
        .slice(0, 3)
        .map((app) => Number(app.score || 0))
        .filter((v) => Number.isFinite(v) && v > 0);
    const exactTitleMatches = topApps.filter((app) => titleContainsWholeKeyword(app.title, keyword)).length;
    const exactTitleDensity = exactTitleMatches / Math.max(1, topApps.length);
    const medianReviewCount = median(reviewCounts);
    const averageTopRating = average(top3Ratings);
    const medianReviewPressure = logScale(medianReviewCount, 50000);
    const top3ReviewPressure = logScale(top3ReviewSum, 150000);
    const ratingPressure = averageTopRating
        ? clamp((averageTopRating - 3.8) / 1.2)
        : 0;
    return {
        competitionScore: round(100 *
            (0.4 * exactTitleDensity +
                0.3 * medianReviewPressure +
                0.2 * top3ReviewPressure +
                0.1 * ratingPressure)),
        metrics: {
            exactTitleMatches,
            medianReviewCount: round(medianReviewCount),
            top3ReviewSum: round(top3ReviewSum),
            averageTopRating: round(averageTopRating),
        },
    };
}
export function computeOpportunityScore({ demandScore, competitionScore, relevanceScore, }) {
    const rawScore = 0.5 * demandScore + 0.1 * relevanceScore - 0.4 * competitionScore;
    return round(clamp(rawScore / 100, 0, 1) * 100);
}
//# sourceMappingURL=scoring.js.map