// 实时热度分析：基于 iTunes RSS 榜单 + 快照对比
import { normalizeTerm } from "./text.js";
export const CHART_TYPES = {
    "top-free": { key: "topfreeapplications", label: "免费榜 Top" },
    "top-paid": { key: "toppaidapplications", label: "付费榜 Top" },
    "new-apps": { key: "newapplications", label: "新上架 Top" },
};
export async function fetchChart(country = "us", chartType = "top-free", limit = 100, genreId = "") {
    const typeInfo = CHART_TYPES[chartType];
    if (!typeInfo)
        throw new Error(`未知榜单类型: ${chartType}`);
    let url = `https://itunes.apple.com/${country}/rss/${typeInfo.key}/limit=${Math.min(limit, 200)}`;
    if (genreId)
        url += `/genre=${genreId}`;
    url += "/json";
    const response = await fetch(url);
    if (!response.ok)
        throw new Error(`iTunes RSS 请求失败: ${response.status}`);
    const data = (await response.json());
    const entries = data?.feed?.entry;
    if (!Array.isArray(entries))
        return [];
    return entries.map((entry, index) => ({
        rank: index + 1,
        id: entry?.id?.attributes?.["im:id"] || "",
        title: entry?.["im:name"]?.label || entry?.title?.label || "",
        developer: entry?.["im:artist"]?.label || "",
        category: entry?.category?.attributes?.term || "Unknown",
        price: parseFloat(entry?.["im:price"]?.attributes?.amount || "0"),
        releaseDate: entry?.["im:releaseDate"]?.label || null,
    }));
}
export function scoreKeywordAgainstChart(keyword, topApps, chartApps) {
    const chartById = new Map(chartApps.map((a) => [a.id, a]));
    const normalizedKeyword = normalizeTerm(keyword);
    const competitorRanks = topApps
        .filter((app) => app.id && chartById.has(app.id))
        .map((app) => chartById.get(app.id).rank);
    const titleMatchRanks = chartApps
        .filter((app) => normalizeTerm(app.title).includes(normalizedKeyword))
        .map((app) => app.rank);
    const bestCompetitorRank = competitorRanks.length
        ? Math.min(...competitorRanks)
        : null;
    const bestTitleRank = titleMatchRanks.length
        ? Math.min(...titleMatchRanks)
        : null;
    const rankToScore = (rank, total) => rank ? Math.round((1 - (rank - 1) / total) * 100) : 0;
    const competitorScore = rankToScore(bestCompetitorRank, chartApps.length) * 0.6;
    const titleScore = rankToScore(bestTitleRank, chartApps.length) * 0.4;
    const trendScore = Math.round(competitorScore + titleScore);
    return {
        trendScore,
        bestCompetitorRank,
        competitorRankCount: competitorRanks.length,
        titleMatchRanks,
        titleMatchCount: titleMatchRanks.length,
    };
}
export async function enrichSnapshotWithTrends(snapshot, { country, chartTypes = ["top-free"], limit = 100, } = {}) {
    const effectiveCountry = country || snapshot?.meta?.country || "us";
    const chartResults = await Promise.all(chartTypes.map(async (type) => {
        try {
            const apps = await fetchChart(effectiveCountry, type, limit);
            return { type, label: CHART_TYPES[type]?.label || type, apps };
        }
        catch (err) {
            return {
                type,
                label: CHART_TYPES[type]?.label || type,
                apps: [],
                error: err.message,
            };
        }
    }));
    const mergedChartMap = new Map();
    for (const { apps, type } of chartResults) {
        for (const app of apps) {
            if (!mergedChartMap.has(app.id) ||
                mergedChartMap.get(app.id).rank > app.rank) {
                mergedChartMap.set(app.id, { ...app, chartType: type });
            }
        }
    }
    const mergedChart = [...mergedChartMap.values()];
    const keywords = Array.isArray(snapshot.keywords) ? snapshot.keywords : [];
    const enriched = keywords.map((kw) => {
        const trend = scoreKeywordAgainstChart(kw.term, kw.topApps || [], mergedChart);
        return { ...kw, trend };
    });
    enriched.sort((a, b) => b.trend.trendScore - a.trend.trendScore);
    return {
        enriched: enriched,
        charts: chartResults,
        chartTotal: mergedChart.length,
        fetchedAt: new Date().toISOString(),
    };
}
export function compareSnapshots(oldSnapshot, newSnapshot) {
    const oldMap = new Map((oldSnapshot.keywords || []).map((kw) => [kw.normalized || kw.term, kw]));
    const results = [];
    for (const kw of newSnapshot.keywords || []) {
        const key = kw.normalized || kw.term;
        const old = oldMap.get(key);
        if (!old) {
            results.push({ term: kw.term, status: "new", delta: null, ...kw });
            continue;
        }
        results.push({
            term: kw.term,
            status: "updated",
            old: {
                demandScore: old.demandScore,
                competitionScore: old.competitionScore,
                opportunityScore: old.opportunityScore,
            },
            demandScore: kw.demandScore,
            competitionScore: kw.competitionScore,
            opportunityScore: kw.opportunityScore,
            demandDelta: Math.round((kw.demandScore - old.demandScore) * 10) / 10,
            competitionDelta: Math.round((kw.competitionScore - old.competitionScore) * 10) / 10,
            opportunityDelta: Math.round((kw.opportunityScore - old.opportunityScore) * 10) / 10,
        });
    }
    const newNormalized = new Set((newSnapshot.keywords || []).map((kw) => kw.normalized || kw.term));
    for (const kw of oldSnapshot.keywords || []) {
        if (!newNormalized.has(kw.normalized || kw.term)) {
            results.push({ term: kw.term, status: "dropped", ...kw });
        }
    }
    results.sort((a, b) => (b.opportunityDelta ?? 0) - (a.opportunityDelta ?? 0));
    return results;
}
const STOP_WORDS = new Set([
    "a",
    "an",
    "the",
    "and",
    "or",
    "for",
    "in",
    "on",
    "of",
    "to",
    "by",
    "is",
    "it",
    "my",
    "me",
    "be",
    "do",
    "go",
    "up",
    "if",
    "at",
    "as",
    "so",
    "no",
    "we",
    "us",
    "app",
    "apps",
    "pro",
    "plus",
    "free",
    "lite",
    "hd",
    "new",
    "all",
    "get",
    "your",
    "with",
    "from",
    "that",
    "this",
    "are",
    "was",
    "has",
    "can",
    "but",
    "not",
    "you",
    "one",
    "out",
    "make",
    "just",
    "best",
    "easy",
    "fast",
    "top",
    "now",
    "more",
    "real",
    "live",
    "good",
    "ai",
]);
export function analyzeChartTrends(chartApps) {
    const categoryCount = new Map();
    for (const app of chartApps) {
        const cat = app.category || "Unknown";
        categoryCount.set(cat, (categoryCount.get(cat) || 0) + 1);
    }
    const topCategories = [...categoryCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([category, count]) => ({
        category,
        count,
        ratio: Math.round((count / chartApps.length) * 100),
    }));
    const wordStats = new Map();
    for (const app of chartApps) {
        const words = app.title
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, " ")
            .split(/\s+/)
            .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
        const seen = new Set();
        for (const word of words) {
            if (seen.has(word))
                continue;
            seen.add(word);
            if (!wordStats.has(word)) {
                wordStats.set(word, { word, count: 0, bestRank: Infinity, apps: [] });
            }
            const stat = wordStats.get(word);
            stat.count += 1;
            if (app.rank < stat.bestRank)
                stat.bestRank = app.rank;
            if (stat.apps.length < 3)
                stat.apps.push(app.title);
        }
    }
    const topWords = [...wordStats.values()]
        .filter((s) => s.count >= 2)
        .sort((a, b) => b.count !== a.count ? b.count - a.count : a.bestRank - b.bestRank)
        .slice(0, 30)
        .map((s) => ({
        word: s.word,
        count: s.count,
        bestRank: s.bestRank === Infinity ? null : s.bestRank,
        exampleApps: s.apps,
    }));
    const paidApps = chartApps.filter((a) => a.price > 0);
    const freeCount = chartApps.length - paidApps.length;
    const avgPaidPrice = paidApps.length
        ? parseFloat((paidApps.reduce((s, a) => s + a.price, 0) / paidApps.length).toFixed(2))
        : 0;
    return {
        totalApps: chartApps.length,
        fetchedAt: new Date().toISOString(),
        topCategories,
        topWords,
        monetization: { freeCount, paidCount: paidApps.length, avgPaidPrice },
    };
}
//# sourceMappingURL=trends.js.map