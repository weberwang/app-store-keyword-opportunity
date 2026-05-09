import { readFile } from "node:fs/promises";
import { normalizeTerm } from "./text.js";
import type {
  AppStoreApp,
  ImportedProviderSignalSnapshot,
  NormalizedMarketSignal,
} from "../types.js";

interface ProviderSnapshotLoadResult {
  configured: boolean;
  snapshot?: ImportedProviderSignalSnapshot;
  warnings: string[];
}

function validateAsoProviderSignalSnapshot(
  parsed: Partial<ImportedProviderSignalSnapshot> | undefined,
): ImportedProviderSignalSnapshot | undefined {
  if (!parsed || typeof parsed.providerId !== "string" || !Array.isArray(parsed.signals)) {
    return undefined;
  }

  return {
    providerId: parsed.providerId,
    generatedAt: parsed.generatedAt,
    signals: parsed.signals,
  };
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeTerritory(value: string | undefined, fallback: string): string {
  return String(value || fallback).trim().toLowerCase();
}

function territoryMatches(signalTerritory: string | undefined, country: string): boolean {
  if (!signalTerritory) {
    return true;
  }
  const normalized = normalizeTerritory(signalTerritory, country);
  return normalized === country || normalized === "global" || normalized === "all";
}

function toNormalizedSignal(
  snapshot: ImportedProviderSignalSnapshot,
  record: ImportedProviderSignalSnapshot["signals"][number],
  country: string,
): NormalizedMarketSignal {
  return {
    entityKind: record.entityKind,
    entityId: String(record.entityId),
    entityLabel: String(record.entityLabel || record.entityId),
    metric: record.metric,
    value: clampScore(Number(record.value || 0)),
    metadata: {
      providerId: snapshot.providerId,
      source: "aso-provider",
      territory: normalizeTerritory(record.territory, country),
      collectedAt: record.collectedAt || snapshot.generatedAt || new Date().toISOString(),
      confidence: clampScore(Number(record.confidence ?? 60)),
      isEstimated: record.isEstimated ?? true,
      rawMetricKey: record.rawMetricKey,
      rawValue: record.rawValue,
      summary: record.summary,
    },
  };
}

export async function loadAsoProviderSignalSnapshot(
  filePath?: string,
): Promise<ProviderSnapshotLoadResult> {
  if (!filePath) {
    return {
      configured: false,
      warnings: [],
    };
  }

  try {
    const content = await readFile(filePath, "utf8");
    const parsed = JSON.parse(content) as Partial<ImportedProviderSignalSnapshot>;
    const snapshot = validateAsoProviderSignalSnapshot(parsed);

    if (!snapshot) {
      return {
        configured: true,
        warnings: [`ASO snapshot file is invalid: ${filePath}`],
      };
    }

    return {
      configured: true,
      snapshot,
      warnings: [],
    };
  } catch (error: any) {
    return {
      configured: true,
      warnings: [`Failed to load ASO snapshot file ${filePath}: ${error.message}`],
    };
  }
}

export async function resolveAsoProviderSignalSnapshot(
  input: { filePath?: string; snapshot?: Partial<ImportedProviderSignalSnapshot> },
): Promise<ProviderSnapshotLoadResult> {
  if (input.snapshot) {
    const snapshot = validateAsoProviderSignalSnapshot(input.snapshot);
    if (!snapshot) {
      return {
        configured: true,
        warnings: ["Inline ASO snapshot is invalid."],
      };
    }
    return {
      configured: true,
      snapshot,
      warnings: [],
    };
  }

  return loadAsoProviderSignalSnapshot(input.filePath);
}

export function extractAsoProviderSignalsForKeyword(
  snapshot: ImportedProviderSignalSnapshot | undefined,
  options: { term: string; country: string; apps: AppStoreApp[] },
): NormalizedMarketSignal[] {
  if (!snapshot?.signals?.length) {
    return [];
  }

  const normalizedTerm = normalizeTerm(options.term);
  const appIds = new Set(options.apps.map((app) => app.id));
  const appTitles = new Set(options.apps.map((app) => normalizeTerm(app.title)));

  return snapshot.signals
    .filter((record) => territoryMatches(record.territory, options.country))
    .filter((record) => {
      if (record.entityKind === "keyword") {
        const entityId = normalizeTerm(record.entityId);
        const entityLabel = normalizeTerm(record.entityLabel || record.entityId);
        return entityId === normalizedTerm || entityLabel === normalizedTerm;
      }

      if (record.entityKind === "app") {
        const entityId = String(record.entityId);
        const entityLabel = normalizeTerm(record.entityLabel || record.entityId);
        return appIds.has(entityId) || appTitles.has(entityLabel);
      }

      return false;
    })
    .map((record) => toNormalizedSignal(snapshot, record, options.country));
}