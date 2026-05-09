import { lookupApps } from "./app-store-client.js";
import { buildAppleChartSignals, mergeMarketSignals } from "./market-signals.js";
import { countFrequentTerms } from "./text.js";
import type { ChartApp } from "../types.js";

function average(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export async function fetchChart(
  country: string,
  chartType: "top-free" | "top-paid" | "new-apps",
  limit: number,
  genreId: string,
): Promise<ChartApp[]> {
  const url = new URL(
    `https://rss.applemarketingtools.com/api/v2/${(country || "us").trim().toLowerCase()}/apps/${chartType}/${Math.min(Math.max(limit, 1), 200)}/apps.json`,
  );
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "app-store-keyword-opportunity/0.3.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Apple chart endpoint failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as any;
  const chartItems = Array.isArray(payload?.feed?.results) ? payload.feed.results : [];
  const details = await lookupApps(
    chartItems.map((item: any) => String(item.id)).filter(Boolean),
    { country },
  );
  const detailById = new Map(details.map((app) => [app.id, app]));

  const apps: ChartApp[] = chartItems.map((item: any, index: number) => {
    const detailed = detailById.get(String(item.id));
    return {
      ...(detailed || {
        id: String(item.id),
        title: String(item.name || item.id),
        developer: String(item.artistName || "Unknown developer"),
        description: undefined,
        score: 0,
        reviews: 0,
        price: chartType === "top-paid" ? 0.99 : 0,
        formattedPrice: chartType === "top-paid" ? "Paid" : "Free",
        currency: undefined,
        free: chartType !== "top-paid",
        genre: "Unknown",
        genreId: undefined,
        url: item.url ? String(item.url) : undefined,
        icon: item.artworkUrl100 ? String(item.artworkUrl100) : undefined,
        releasedAt: item.releaseDate ? String(item.releaseDate) : undefined,
        updatedAt: undefined,
        version: undefined,
      }),
      rank: index + 1,
      chartType,
    } satisfies ChartApp;
  });

  return genreId ? apps.filter((app) => app.genreId === genreId) : apps;
}

export function analyzeChartTrends(apps: ChartApp[]) {
  const country = apps[0]?.url?.split("/")[3] || "us";
  const chartType = apps[0]?.chartType || "top-free";
  const { signals, coverage } = mergeMarketSignals(
    [buildAppleChartSignals(country, chartType, apps)],
    { expectedSources: ["apple-public", "trend"] },
  );
  const genreCounts = new Map<string, number>();
  for (const app of apps) {
    const key = app.genre || "Unknown";
    genreCounts.set(key, (genreCounts.get(key) || 0) + 1);
  }

  const topGenres = [...genreCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 10)
    .map(([genre, count]) => ({ genre, count }));

  const titleTerms = countFrequentTerms(apps.map((app) => app.title), { limit: 10 }).map((item) => ({
    term: item.term,
    count: item.count,
  }));

  const freeApps = apps.filter((app) => app.free).length;
  const paidApps = apps.length - freeApps;

  return {
    analyzedAt: new Date().toISOString(),
    totalApps: apps.length,
    topGenres,
    titleTerms,
    monetization: {
      freeApps,
      paidApps,
      freeRatio: apps.length ? Math.round((freeApps / apps.length) * 100) : 0,
      averageRating: Number(average(apps.map((app) => app.score || 0)).toFixed(2)),
    },
    marketSignals: signals,
    signalCoverage: coverage,
    leadingApps: apps.slice(0, 10).map((app) => ({
      rank: app.rank,
      title: app.title,
      developer: app.developer,
      genre: app.genre,
      score: app.score,
      reviews: app.reviews,
      free: app.free,
    })),
  };
}