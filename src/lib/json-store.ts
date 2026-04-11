import { readFile, mkdir, writeFile } from "fs/promises";
import { dirname } from "path";
import type { Snapshot } from "../types.js";

const EMPTY_SNAPSHOT: Snapshot = {
  meta: {
    generatedAt: null,
    country: "us",
    language: "en-us",
    seeds: [],
    totalKeywords: 0,
  },
  keywords: [],
};

export async function readSnapshot(filePath: string): Promise<Snapshot> {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content) as Snapshot;
  } catch (error: any) {
    if (error.code === "ENOENT") return EMPTY_SNAPSHOT;
    throw error;
  }
}

export async function writeSnapshot(
  filePath: string,
  snapshot: Snapshot,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}
