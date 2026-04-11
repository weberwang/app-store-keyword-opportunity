// 竞品评论情感分析

import scraper from "app-store-scraper";
import pLimitModule from "p-limit";
import { normalizeTerm } from "./text";
import type {
  ReviewAnalysisResult,
  AppReviewSummary,
  ReviewWord,
} from "../types";

const pLimit = (pLimitModule as any).default || pLimitModule;

const REVIEW_STOP_WORDS = new Set([
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
  "love",
  "great",
  "good",
  "bad",
  "i",
  "would",
  "could",
  "should",
  "use",
  "used",
  "using",
  "really",
  "very",
  "also",
  "just",
  "even",
  "like",
  "time",
  "been",
  "have",
  "its",
  "when",
  "they",
  "their",
  "there",
  "than",
  "then",
  "some",
  "what",
  "which",
  "will",
  "would",
  "about",
  "after",
  "before",
  "does",
  "did",
  "been",
  "into",
  "over",
  "need",
  "want",
  "only",
  "back",
  "well",
  "still",
  "ever",
  "never",
  "always",
  "often",
  "please",
  "way",
  "work",
  "works",
  "worked",
]);

async function fetchAppReviews(
  appId: string,
  { country = "us", pages = 2 } = {},
): Promise<any[]> {
  const allReviews: any[] = [];
  for (let page = 1; page <= pages; page++) {
    try {
      const reviews = await (scraper as any).reviews({
        id: String(appId),
        country,
        sort: (scraper as any).sort.HELPFUL,
        page,
      });
      if (!Array.isArray(reviews) || !reviews.length) break;
      allReviews.push(...reviews);
    } catch {
      break;
    }
  }
  return allReviews;
}

async function fetchAppRatings(
  appId: string,
  { country = "us" } = {},
): Promise<any | null> {
  try {
    return await (scraper as any).ratings({ id: String(appId), country });
  } catch {
    return null;
  }
}

function extractTopWords(texts: string[], topN = 20): ReviewWord[] {
  const wordCount = new Map<string, number>();
  for (const text of texts) {
    const words = normalizeTerm(text)
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !REVIEW_STOP_WORDS.has(w));
    const seen = new Set<string>();
    for (const word of words) {
      if (seen.has(word)) continue;
      seen.add(word);
      wordCount.set(word, (wordCount.get(word) || 0) + 1);
    }
  }
  return [...wordCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word, count]) => ({ word, count }));
}

export async function analyzeCompetitorReviews(
  apps: Array<{ id: string; title: string }>,
  { country = "us", pages = 2 } = {},
): Promise<ReviewAnalysisResult> {
  const limit = pLimit(2);

  const results = await Promise.all(
    apps.map((app) =>
      limit(async () => {
        const [reviews, ratingsData] = await Promise.all([
          fetchAppReviews(app.id, { country, pages }),
          fetchAppRatings(app.id, { country }),
        ]);
        return { app, reviews, ratingsData };
      }),
    ),
  );

  const totalHistogram: Record<number, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };
  for (const { ratingsData } of results) {
    if (ratingsData?.histogram) {
      for (const star of [1, 2, 3, 4, 5]) {
        totalHistogram[star] += ratingsData.histogram[star] || 0;
      }
    }
  }
  const totalRatings = Object.values(totalHistogram).reduce((s, v) => s + v, 0);

  const positiveTexts: string[] = [];
  const negativeTexts: string[] = [];

  for (const { reviews } of results) {
    for (const r of reviews) {
      const text = [r.title || "", r.text || ""].join(" ");
      if (r.score >= 4) positiveTexts.push(text);
      else if (r.score <= 2) negativeTexts.push(text);
    }
  }

  const painWords = extractTopWords(negativeTexts, 40);
  const sellingWords = extractTopWords(positiveTexts, 40);

  const sellingSet = new Set(sellingWords.map((w) => w.word));
  const painSet = new Set(painWords.map((w) => w.word));
  const sellWordCount = new Map(sellingWords.map((w) => [w.word, w.count]));
  const painWordCount = new Map(painWords.map((w) => [w.word, w.count]));

  const filteredPain = painWords
    .filter(
      (w) =>
        !sellingSet.has(w.word) ||
        (painWordCount.get(w.word) || 0) >=
          (sellWordCount.get(w.word) || 0) * 2,
    )
    .slice(0, 15);

  const filteredSelling = sellingWords
    .filter(
      (w) =>
        !painSet.has(w.word) ||
        (sellWordCount.get(w.word) || 0) >=
          (painWordCount.get(w.word) || 0) * 2,
    )
    .slice(0, 15);

  const painExamples = new Map<string, string>();
  for (const { word } of filteredPain.slice(0, 5)) {
    for (const { reviews } of results) {
      const hit = reviews.find(
        (r: any) => r.score <= 2 && normalizeTerm(r.text || "").includes(word),
      );
      if (hit) {
        painExamples.set(
          word,
          hit.text.slice(0, 100).replace(/\n/g, " ") + "…",
        );
        break;
      }
    }
  }

  const appSummaries: AppReviewSummary[] = results.map(
    ({ app, reviews, ratingsData }) => {
      const positive = reviews.filter((r: any) => r.score >= 4).length;
      const negative = reviews.filter((r: any) => r.score <= 2).length;
      const hist = ratingsData?.histogram || {};
      const total = Object.values(hist as Record<string, number>).reduce(
        (s: number, v) => s + (v as number),
        0,
      );
      const avg =
        total > 0
          ? [1, 2, 3, 4, 5].reduce(
              (s, star) => s + star * (hist[star] || 0),
              0,
            ) / total
          : null;
      return {
        id: app.id,
        title: app.title,
        reviewsFetched: reviews.length,
        positiveCount: positive,
        negativeCount: negative,
        avgScore: avg !== null ? parseFloat(avg.toFixed(2)) : null,
        totalRatings: total || null,
      };
    },
  );

  return {
    appSummaries,
    painPoints: filteredPain,
    sellingPoints: filteredSelling,
    painExamples,
    ratingHistogram: totalHistogram,
    totalRatings,
    reviewsFetched: results.reduce((s, r) => s + r.reviews.length, 0),
    country,
    analyzedAt: new Date().toISOString(),
  };
}
