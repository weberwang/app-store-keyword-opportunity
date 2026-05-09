import type { AppStoreApp } from "../types.js";

export const defaultGameGenreId = "6014";

const gameGenreNames = new Set([
  "games",
  "action",
  "adventure",
  "arcade",
  "board",
  "card",
  "casino",
  "dice",
  "family",
  "kids",
  "music",
  "puzzle",
  "racing",
  "role playing",
  "simulation",
  "sports",
  "strategy",
  "trivia",
  "word",
]);

function normalizeText(value: string | undefined): string {
  return String(value || "").trim().toLowerCase();
}

export function isGameStoreApp(
  app: Pick<AppStoreApp, "genreId" | "genre">,
  genreId: string = defaultGameGenreId,
): boolean {
  if (!genreId) {
    return true;
  }

  if (genreId !== defaultGameGenreId) {
    return String(app.genreId || "") === genreId;
  }

  const numericGenreId = Number(app.genreId || 0);
  if (numericGenreId === 6014 || (numericGenreId >= 7001 && numericGenreId <= 7019)) {
    return true;
  }

  return gameGenreNames.has(normalizeText(app.genre));
}

export function filterGameApps<T extends Pick<AppStoreApp, "genreId" | "genre">>(
  apps: T[],
  genreId: string = defaultGameGenreId,
): T[] {
  return apps.filter((app) => isGameStoreApp(app, genreId));
}