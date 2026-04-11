import scraper from "app-store-scraper";
function toNum(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}
function normalizeSuggestionItem(item, index) {
    if (typeof item === "string")
        return { term: item, rank: index + 1 };
    if (!item || typeof item !== "object")
        return null;
    const term = item.term || item.text || item.keyword || item.suggestion || item.name;
    if (!term)
        return null;
    return {
        term,
        rank: toNum(item.rank ?? item.priority ?? item.index, index + 1),
    };
}
function normalizeApp(app) {
    if (!app || typeof app !== "object")
        return null;
    const genre = app.genre || app.primaryGenreName || app.genres?.[0] || "Unknown";
    const score = toNum(app.score ?? app.averageUserRating);
    const reviews = toNum(app.reviews ?? app.userRatingCount ?? app.ratingCount);
    const price = toNum(app.price ?? app.formattedPrice, 0);
    const free = typeof app.free === "boolean" ? app.free : price === 0;
    return {
        id: String(app.id ?? app.appId ?? app.trackId ?? ""),
        title: app.title || app.trackName || "",
        url: app.url || app.trackViewUrl || "",
        developer: app.developer || app.artistName || "",
        developerId: String(app.developerId ?? app.artistId ?? ""),
        genre,
        score,
        reviews,
        price,
        free,
        contentRating: app.contentRating || app.contentAdvisoryRating || null,
        releasedAt: app.releasedAt || app.releaseDate || null,
        updatedAt: app.updatedAt || app.updated || app.currentVersionReleaseDate || null,
        description: app.description || null,
    };
}
export async function fetchSuggestions(term, { country = "us" } = {}) {
    try {
        const raw = await scraper.suggest({ term, country });
        return Array.isArray(raw)
            ? raw
                .map((item, i) => normalizeSuggestionItem(item, i))
                .filter(Boolean)
            : [];
    }
    catch {
        return [];
    }
}
export async function searchApps(term, { country = "us", language = "en-us", limit = 200, genreId = "", } = {}) {
    try {
        const params = new URLSearchParams({
            term,
            country,
            entity: "software",
            limit: String(Math.min(limit, 200)),
        });
        if (genreId)
            params.set("genreId", genreId);
        const response = await fetch(`https://itunes.apple.com/search?${params}`, {
            headers: { "Accept-Language": language },
        });
        if (!response.ok)
            return [];
        const data = (await response.json());
        return Array.isArray(data.results)
            ? data.results
                .map((item) => normalizeApp(item))
                .filter(Boolean)
            : [];
    }
    catch {
        return [];
    }
}
export async function fetchAppDetails(id, { country = "us", language = "en-us", } = {}) {
    if (!id)
        return null;
    try {
        const params = new URLSearchParams({ id, country, entity: "software" });
        const response = await fetch(`https://itunes.apple.com/lookup?${params}`, {
            headers: { "Accept-Language": language },
        });
        if (!response.ok)
            return null;
        const data = (await response.json());
        const results = Array.isArray(data.results) ? data.results : [];
        const app = results.find((r) => r.wrapperType === "software" || r.kind === "software") || results[0];
        return app ? normalizeApp(app) : null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=app-store-client.js.map