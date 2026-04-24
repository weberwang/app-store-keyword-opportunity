import { buildAppleReviewSignals } from "./market-signals.js";
import type { AppReview, AppStoreApp, NormalizedMarketSignal } from "../types.js";

interface SearchAppsOptions {
  country?: string;
  language?: string;
  limit?: number;
  genreId?: string;
}

interface FetchReviewsOptions {
  country?: string;
  pages?: number;
}

interface ItunesPayload {
  resultCount?: number;
  results?: any[];
}

function normalizeCountry(country: string | undefined): string {
  return (country || "us").trim().toLowerCase();
}

function normalizeLanguage(language: string | undefined): string {
  const normalized = (language || "en-us").trim().toLowerCase().replace(/-/g, "_");
  if (!normalized) {
    return "en_us";
  }
  return normalized;
}

async function fetchJson<T>(url: URL): Promise<T> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "app-store-keyword-opportunity/0.3.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Apple endpoint failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function toAppStoreApp(result: any): AppStoreApp | null {
  if (!result || !result.trackId || !result.trackName) {
    return null;
  }

  const price = Number(result.price ?? 0);
  const averageUserRating = Number(result.averageUserRating ?? 0);
  const userRatingCount = Number(result.userRatingCount ?? 0);

  return {
    id: String(result.trackId),
    title: String(result.trackName),
    developer: String(result.artistName || result.sellerName || "Unknown developer"),
    description: typeof result.description === "string" ? result.description : undefined,
    score: Number.isFinite(averageUserRating) ? averageUserRating : 0,
    reviews: Number.isFinite(userRatingCount) ? userRatingCount : 0,
    price: Number.isFinite(price) ? price : 0,
    formattedPrice: String(result.formattedPrice || (price > 0 ? price.toFixed(2) : "Free")),
    currency: result.currency ? String(result.currency) : undefined,
    free: price === 0,
    genre: String(result.primaryGenreName || "Unknown"),
    genreId: result.primaryGenreId ? String(result.primaryGenreId) : undefined,
    url: result.trackViewUrl ? String(result.trackViewUrl) : undefined,
    icon: result.artworkUrl100 ? String(result.artworkUrl100) : undefined,
    releasedAt: result.releaseDate ? String(result.releaseDate) : undefined,
    updatedAt: result.currentVersionReleaseDate ? String(result.currentVersionReleaseDate) : undefined,
    version: result.version ? String(result.version) : undefined,
    contentAdvisoryRating: result.contentAdvisoryRating
      ? String(result.contentAdvisoryRating)
      : result.trackContentRating
        ? String(result.trackContentRating)
        : undefined,
  };
}

function parseLabel(value: any): string {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value.label === "string") {
    return value.label;
  }
  return "";
}

function toReview(entry: any): AppReview | null {
  const rating = Number(parseLabel(entry?.["im:rating"]));
  const content = parseLabel(entry?.content);
  if (!rating || !content) {
    return null;
  }

  return {
    id: parseLabel(entry?.id),
    title: parseLabel(entry?.title),
    content,
    rating,
    author: parseLabel(entry?.author?.name) || "Unknown reviewer",
    version: parseLabel(entry?.["im:version"]) || undefined,
    updatedAt: parseLabel(entry?.updated) || undefined,
    voteSum: Number(parseLabel(entry?.["im:voteSum"]) || 0),
    voteCount: Number(parseLabel(entry?.["im:voteCount"]) || 0),
  };
}

export async function searchApps(term: string, options: SearchAppsOptions = {}): Promise<AppStoreApp[]> {
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", term);
  url.searchParams.set("country", normalizeCountry(options.country));
  url.searchParams.set("media", "software");
  url.searchParams.set("entity", "software");
  url.searchParams.set("limit", String(Math.min(Math.max(options.limit || 50, 1), 200)));
  url.searchParams.set("lang", normalizeLanguage(options.language));
  url.searchParams.set("version", "2");

  const payload = await fetchJson<ItunesPayload>(url);
  const apps = (payload.results || []).map(toAppStoreApp).filter((app): app is AppStoreApp => Boolean(app));

  if (!options.genreId) {
    return apps;
  }

  return apps.filter((app) => app.genreId === String(options.genreId));
}

export async function lookupApps(appIds: string[], options: Omit<SearchAppsOptions, "limit"> = {}): Promise<AppStoreApp[]> {
  if (!appIds.length) {
    return [];
  }

  const chunks = chunk(appIds, 50);
  const responses = await Promise.all(
    chunks.map(async (ids) => {
      const url = new URL("https://itunes.apple.com/lookup");
      url.searchParams.set("id", ids.join(","));
      url.searchParams.set("country", normalizeCountry(options.country));
      url.searchParams.set("entity", "software");
      url.searchParams.set("lang", normalizeLanguage(options.language));
      return fetchJson<ItunesPayload>(url);
    }),
  );

  const byId = new Map<string, AppStoreApp>();
  for (const response of responses) {
    for (const app of (response.results || []).map(toAppStoreApp).filter((item): item is AppStoreApp => Boolean(item))) {
      if (!options.genreId || app.genreId === String(options.genreId)) {
        byId.set(app.id, app);
      }
    }
  }

  return appIds.map((id) => byId.get(id)).filter((app): app is AppStoreApp => Boolean(app));
}

export async function fetchCustomerReviews(appId: string, options: FetchReviewsOptions = {}): Promise<AppReview[]> {
  const country = normalizeCountry(options.country);
  const pages = Math.min(Math.max(options.pages || 1, 1), 10);
  const reviews: AppReview[] = [];

  for (let page = 1; page <= pages; page += 1) {
    const url = new URL(
      `https://itunes.apple.com/rss/customerreviews/page=${page}/id=${appId}/sortby=mostrecent/json`,
    );
    url.searchParams.set("l", country === "jp" ? "ja" : "en");
    url.searchParams.set("cc", country);

    const payload = await fetchJson<any>(url);
    const entries = Array.isArray(payload?.feed?.entry)
      ? payload.feed.entry
      : payload?.feed?.entry
        ? [payload.feed.entry]
        : [];
    const pageReviews = entries.map(toReview).filter((review): review is AppReview => Boolean(review));
    if (!pageReviews.length) {
      break;
    }
    reviews.push(...pageReviews);
    if (pageReviews.length < 50) {
      break;
    }
  }

  return reviews;
}

export function collectApplePublicReviewSignals(
  appId: string,
  title: string,
  country: string,
  reviews: AppReview[],
): NormalizedMarketSignal[] {
  return buildAppleReviewSignals(appId, title, normalizeCountry(country), reviews);
}