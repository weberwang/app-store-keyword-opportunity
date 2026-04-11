import scraper from "app-store-scraper";
import type { AppInfo, SuggestionItem } from "../types.js";

function toNum(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSuggestionItem(
  item: any,
  index: number,
): SuggestionItem | null {
  if (typeof item === "string") return { term: item, rank: index + 1 };
  if (!item || typeof item !== "object") return null;
  const term =
    item.term || item.text || item.keyword || item.suggestion || item.name;
  if (!term) return null;
  return {
    term,
    rank: toNum(item.rank ?? item.priority ?? item.index, index + 1),
  };
}

function normalizeApp(app: any): AppInfo | null {
  if (!app || typeof app !== "object") return null;
  const genre =
    app.genre || app.primaryGenreName || app.genres?.[0] || "Unknown";
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
    updatedAt:
      app.updatedAt || app.updated || app.currentVersionReleaseDate || null,
    description: app.description || null,
  };
}

export async function fetchSuggestions(
  term: string,
  { country = "us" }: { country?: string } = {},
): Promise<SuggestionItem[]> {
  try {
    const raw = await (scraper as any).suggest({ term, country });
    return Array.isArray(raw)
      ? (raw
          .map((item: any, i: number) => normalizeSuggestionItem(item, i))
          .filter(Boolean) as SuggestionItem[])
      : [];
  } catch {
    return [];
  }
}

export async function searchApps(
  term: string,
  {
    country = "us",
    language = "en-us",
    limit = 200,
    genreId = "",
  }: {
    country?: string;
    language?: string;
    limit?: number;
    genreId?: string;
  } = {},
): Promise<AppInfo[]> {
  try {
    const params = new URLSearchParams({
      term,
      country,
      entity: "software",
      limit: String(Math.min(limit, 200)),
    });
    if (genreId) params.set("genreId", genreId);
    const response = await fetch(`https://itunes.apple.com/search?${params}`, {
      headers: { "Accept-Language": language },
    });
    if (!response.ok) return [];
    const data = (await response.json()) as any;
    return Array.isArray(data.results)
      ? (data.results
          .map((item: any) => normalizeApp(item))
          .filter(Boolean) as AppInfo[])
      : [];
  } catch {
    return [];
  }
}

export async function fetchAppDetails(
  id: string,
  {
    country = "us",
    language = "en-us",
  }: { country?: string; language?: string } = {},
): Promise<AppInfo | null> {
  if (!id) return null;
  try {
    const params = new URLSearchParams({ id, country, entity: "software" });
    const response = await fetch(`https://itunes.apple.com/lookup?${params}`, {
      headers: { "Accept-Language": language },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as any;
    const results = Array.isArray(data.results) ? data.results : [];
    const app =
      results.find(
        (r: any) => r.wrapperType === "software" || r.kind === "software",
      ) || results[0];
    return app ? normalizeApp(app) : null;
  } catch {
    return null;
  }
}
