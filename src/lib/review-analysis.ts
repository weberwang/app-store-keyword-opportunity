import { fetchCustomerReviews, lookupApps } from "./app-store-client.js";
import { mapWithConcurrency } from "./async.js";
import { countFrequentTerms } from "./text.js";

interface ReviewSourceApp {
  id: string;
  title: string;
}

function average(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export async function analyzeCompetitorReviews(
  apps: ReviewSourceApp[],
  options: { country?: string; pages?: number } = {},
) {
  const country = (options.country || "us").trim().toLowerCase();
  const pages = Math.min(Math.max(options.pages || 3, 1), 10);
  const details = await lookupApps(apps.map((app) => app.id), { country });
  const titleById = new Map(details.map((app) => [app.id, app.title]));

  const reviewSets = await mapWithConcurrency(apps, 3, async (app) => {
    const reviews = await fetchCustomerReviews(app.id, { country, pages });
    return {
      appId: app.id,
      title: titleById.get(app.id) || app.title,
      reviews,
    };
  });

  const ratingHistogram = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const allNegativeTexts: string[] = [];
  const allPositiveTexts: string[] = [];
  const painExamples: Array<{ appId: string; title: string; rating: number; excerpt: string }> = [];

  const appSummaries = reviewSets.map((entry) => {
    for (const review of entry.reviews) {
      ratingHistogram[review.rating as keyof typeof ratingHistogram] += 1;
      if (review.rating <= 3) {
        allNegativeTexts.push(review.content);
        if (painExamples.length < 8) {
          painExamples.push({
            appId: entry.appId,
            title: entry.title,
            rating: review.rating,
            excerpt: review.content.slice(0, 180),
          });
        }
      } else {
        allPositiveTexts.push(review.content);
      }
    }

    const negativeTerms = countFrequentTerms(
      entry.reviews.filter((review) => review.rating <= 3).map((review) => review.content),
      { limit: 5 },
    );
    const positiveTerms = countFrequentTerms(
      entry.reviews.filter((review) => review.rating >= 4).map((review) => review.content),
      { limit: 5 },
    );

    return {
      appId: entry.appId,
      title: entry.title,
      reviewsFetched: entry.reviews.length,
      averageRating: Number(average(entry.reviews.map((review) => review.rating)).toFixed(2)),
      topPainPoints: negativeTerms.map((item) => item.term),
      topSellingPoints: positiveTerms.map((item) => item.term),
    };
  });

  const painPoints = countFrequentTerms(allNegativeTexts, { limit: 20 }).map((item) => ({
    term: item.term,
    count: item.count,
  }));
  const sellingPoints = countFrequentTerms(allPositiveTexts, { limit: 20 }).map((item) => ({
    term: item.term,
    count: item.count,
  }));
  const totalRatings = Object.values(ratingHistogram).reduce((sum, value) => sum + value, 0);

  return {
    analyzedAt: new Date().toISOString(),
    reviewsFetched: totalRatings,
    appSummaries,
    painPoints,
    sellingPoints,
    painExamples,
    ratingHistogram,
    totalRatings,
  };
}