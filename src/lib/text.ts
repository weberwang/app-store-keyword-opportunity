const DEFAULT_STOP_WORDS = new Set([
  "a",
  "about",
  "after",
  "again",
  "against",
  "all",
  "also",
  "an",
  "and",
  "app",
  "apps",
  "are",
  "as",
  "at",
  "be",
  "best",
  "build",
  "by",
  "day",
  "days",
  "do",
  "each",
  "every",
  "for",
  "from",
  "free",
  "good",
  "great",
  "have",
  "how",
  "get",
  "help",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "make",
  "many",
  "more",
  "new",
  "not",
  "of",
  "one",
  "on",
  "our",
  "or",
  "out",
  "pro",
  "plus",
  "simple",
  "so",
  "start",
  "stay",
  "than",
  "the",
  "their",
  "them",
  "there",
  "these",
  "this",
  "to",
  "track",
  "tracker",
  "use",
  "using",
  "want",
  "way",
  "what",
  "when",
  "will",
  "with",
  "work",
  "you",
  "your",
]);

export function normalizeTerm(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function toCsvList(value: unknown): string[] {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function tokenizeText(value: string, extraStopWords: Iterable<string> = []): string[] {
  const stopWords = new Set([...DEFAULT_STOP_WORDS, ...extraStopWords]);
  return normalizeTerm(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !stopWords.has(token));
}

export function countFrequentTerms(
  texts: string[],
  options: { stopWords?: Iterable<string>; limit?: number } = {},
): Array<{ term: string; count: number }> {
  const counts = new Map<string, number>();
  for (const text of texts) {
    for (const token of tokenizeText(text, options.stopWords)) {
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return left[0].localeCompare(right[0]);
    })
    .slice(0, options.limit ?? 20)
    .map(([term, count]) => ({ term, count }));
}