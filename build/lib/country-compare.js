// 多国市场横向对比
import pLimitModule from "p-limit";
import { searchApps } from "./app-store-client.js";
import { computeCompetitionScore, computeDemandScore, computeOpportunityScore, } from "./scoring.js";
const pLimit = pLimitModule.default || pLimitModule;
async function scoreTermInCountry(term, country, { language = "en-us", limit = 50, genreId = "" } = {}) {
    try {
        const apps = await searchApps(term, { country, language, limit, genreId });
        if (!apps.length) {
            return {
                country,
                term,
                demandScore: 0,
                competitionScore: 0,
                opportunityScore: 0,
                empty: true,
            };
        }
        const demandScore = computeDemandScore({
            bestRank: 1,
            suggestionCount: 1,
            resultCount: apps.length,
        });
        const { competitionScore, metrics } = computeCompetitionScore(term, apps);
        const opportunityScore = computeOpportunityScore({
            demandScore,
            competitionScore,
            relevanceScore: 100,
        });
        const paidApps = apps.filter((a) => !a.free);
        const freeRatio = apps.length
            ? (apps.length - paidApps.length) / apps.length
            : 1;
        const avgAppScore = apps.length
            ? parseFloat((apps.reduce((s, a) => s + (a.score || 0), 0) / apps.length).toFixed(2))
            : 0;
        return {
            country,
            term,
            resultCount: apps.length,
            demandScore,
            competitionScore,
            opportunityScore,
            freeRatio: Math.round(freeRatio * 100),
            avgAppScore,
            metrics,
            topApp: apps[0]
                ? {
                    title: apps[0].title,
                    score: apps[0].score,
                    developer: apps[0].developer,
                }
                : null,
            empty: false,
        };
    }
    catch {
        return {
            country,
            term,
            demandScore: 0,
            competitionScore: 0,
            opportunityScore: 0,
            empty: true,
            error: true,
        };
    }
}
export async function compareAcrossCountries(terms, countries, { language = "en-us", limit = 50, genreId = "", concurrency = 4 } = {}) {
    const limiter = pLimit(concurrency);
    const tasks = [];
    for (const term of terms) {
        for (const country of countries) {
            tasks.push(limiter(() => scoreTermInCountry(term, country, { language, limit, genreId })));
        }
    }
    const flat = await Promise.all(tasks);
    const byTerm = new Map();
    for (const result of flat) {
        if (!byTerm.has(result.term))
            byTerm.set(result.term, new Map());
        byTerm.get(result.term).set(result.country, result);
    }
    const termSummaries = [];
    for (const [term, countryMap] of byTerm.entries()) {
        const countryResults = [...countryMap.values()].filter((r) => !r.empty);
        if (!countryResults.length)
            continue;
        countryResults.sort((a, b) => b.opportunityScore - a.opportunityScore);
        const best = countryResults[0];
        const worst = countryResults[countryResults.length - 1];
        termSummaries.push({
            term,
            bestCountry: best.country,
            bestOpportunityScore: best.opportunityScore,
            worstCountry: worst.country,
            countryResults,
            spread: best.opportunityScore - worst.opportunityScore,
        });
    }
    termSummaries.sort((a, b) => b.bestOpportunityScore - a.bestOpportunityScore);
    const countrySummaries = countries.map((country) => {
        const results = flat.filter((r) => r.country === country && !r.empty);
        const avgOpportunity = results.length
            ? Math.round(results.reduce((s, r) => s + r.opportunityScore, 0) / results.length)
            : 0;
        const avgCompetition = results.length
            ? Math.round(results.reduce((s, r) => s + r.competitionScore, 0) / results.length)
            : 0;
        const avgAppScore = results.length
            ? parseFloat((results.reduce((s, r) => s + (r.avgAppScore || 0), 0) /
                results.length).toFixed(2))
            : 0;
        return {
            country,
            avgOpportunity,
            avgCompetition,
            avgAppScore,
            count: results.length,
        };
    });
    countrySummaries.sort((a, b) => b.avgOpportunity - a.avgOpportunity);
    return {
        termSummaries,
        countrySummaries,
        flat,
        analyzedAt: new Date().toISOString(),
    };
}
//# sourceMappingURL=country-compare.js.map