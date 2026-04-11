import pLimitModule from "p-limit";
import { fetchAppDetails, fetchSuggestions, searchApps, } from "./app-store-client.js";
import { computeCompetitionScore, computeDemandScore, computeOpportunityScore, computeRelevanceScore, } from "./scoring.js";
import { computeMarketInsight } from "./insight.js";
import { normalizeTerm, uniqueTerms } from "./text.js";
const pLimit = pLimitModule.default || pLimitModule;
function mergeCandidate(candidateMap, rawTerm, { seed, rank, source }) {
    const term = String(rawTerm || "").trim();
    const normalized = normalizeTerm(term);
    if (!normalized)
        return;
    const existing = candidateMap.get(normalized) || {
        term,
        normalized,
        seeds: new Set(),
        sources: new Set(),
        occurrences: 0,
        bestRank: null,
    };
    existing.seeds.add(seed);
    existing.sources.add(source);
    existing.occurrences += 1;
    if (existing.bestRank === null || rank < existing.bestRank)
        existing.bestRank = rank;
    if (existing.term.length > term.length)
        existing.term = term;
    candidateMap.set(normalized, existing);
}
function mergeApps(searchResults, detailResults) {
    const detailById = new Map(detailResults
        .filter(Boolean)
        .map((item) => [String(item.id), item]));
    return searchResults.map((result) => ({
        ...result,
        ...(detailById.get(String(result.id)) || {}),
    }));
}
async function analyzeCandidate(candidate, options) {
    const searchResults = await searchApps(candidate.term, {
        country: options.country,
        language: options.language,
        limit: options.resultsLimit,
        genreId: options.genreId,
    });
    const detailIds = searchResults
        .slice(0, options.detailLimit)
        .map((item) => item.id)
        .filter(Boolean);
    const detailLimiter = pLimit(2);
    const detailResults = await Promise.all(detailIds.map((id) => detailLimiter(() => fetchAppDetails(id, {
        country: options.country,
        language: options.language,
    }))));
    const topApps = mergeApps(searchResults, detailResults);
    const seeds = Array.from(candidate.seeds);
    const relevanceScore = computeRelevanceScore(candidate.term, seeds);
    const demandScore = computeDemandScore({
        bestRank: candidate.bestRank,
        suggestionCount: candidate.occurrences,
        resultCount: topApps.length,
    });
    const { competitionScore, metrics } = computeCompetitionScore(candidate.term, topApps);
    const opportunityScore = computeOpportunityScore({
        demandScore,
        competitionScore,
        relevanceScore,
    });
    const insight = computeMarketInsight(candidate.term, topApps);
    return {
        term: candidate.term,
        normalized: candidate.normalized,
        country: options.country,
        seeds,
        bestSuggestionRank: candidate.bestRank,
        suggestionCount: candidate.occurrences,
        sourceCount: candidate.sources.size,
        relevanceScore,
        demandScore,
        competitionScore,
        opportunityScore,
        metrics,
        insight,
        topApps,
    };
}
export async function collectKeywordSnapshot(options = {}) {
    const seeds = uniqueTerms(options.seeds);
    const country = options.country || "us";
    const language = options.language || "en-us";
    const suggestionsLimit = options.suggestionsLimit ?? 10;
    const resultsLimit = options.resultsLimit ?? 10;
    const detailLimit = options.detailLimit ?? 5;
    const concurrency = options.concurrency ?? 3;
    const genreId = options.genreId || "";
    if (!seeds.length)
        throw new Error("At least one seed keyword is required.");
    const candidateMap = new Map();
    for (const seed of seeds) {
        mergeCandidate(candidateMap, seed, { seed, rank: 1, source: "seed" });
        const suggestions = await fetchSuggestions(seed, { country });
        for (const suggestion of suggestions.slice(0, suggestionsLimit)) {
            mergeCandidate(candidateMap, suggestion.term, {
                seed,
                rank: suggestion.rank,
                source: "suggest",
            });
        }
    }
    const candidates = Array.from(candidateMap.values());
    const keywordLimit = pLimit(concurrency);
    const keywords = (await Promise.all(candidates.map((candidate) => keywordLimit(() => analyzeCandidate(candidate, {
        country,
        language,
        resultsLimit,
        detailLimit,
        genreId,
    }))))).filter(Boolean);
    keywords.sort((l, r) => {
        if (r.opportunityScore !== l.opportunityScore)
            return r.opportunityScore - l.opportunityScore;
        if (l.competitionScore !== r.competitionScore)
            return l.competitionScore - r.competitionScore;
        return r.demandScore - l.demandScore;
    });
    return {
        meta: {
            generatedAt: new Date().toISOString(),
            country,
            language,
            seeds,
            genreId,
            totalKeywords: keywords.length,
        },
        keywords,
    };
}
//# sourceMappingURL=collector.js.map