import type { KeywordResult } from "../types.js";

function average(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function topKeywords(items: KeywordResult[], predicate: (item: KeywordResult) => boolean): KeywordResult[] {
  return items.filter(predicate).slice(0, 8);
}

export function buildProductStrategy(keywords: KeywordResult[]) {
  if (!keywords.length) {
    return null;
  }

  const sorted = [...keywords].sort(
    (left, right) =>
      (right.highValueSummary?.overallScore || right.opportunityScore) -
      (left.highValueSummary?.overallScore || left.opportunityScore),
  );
  const averageOpportunity = Math.round(average(sorted.map((keyword) => keyword.opportunityScore)));
  const averageHighValue = Math.round(
    average(sorted.map((keyword) => keyword.highValueSummary?.overallScore || keyword.opportunityScore)),
  );
  const averageCompetition = Math.round(average(sorted.map((keyword) => keyword.competitionScore)));
  const averageDemand = Math.round(average(sorted.map((keyword) => keyword.demandScore)));
  const averageEvidenceConfidence = Math.round(
    average(sorted.map((keyword) => keyword.highValueSummary?.dimensions.evidenceConfidence.score || 0)),
  );
  const paidRatio = Math.round(average(sorted.map((keyword) => keyword.metrics.paidRatio || 0)));

  const monetizationModel = paidRatio >= 35 ? "premium or hybrid subscription" : "freemium with upgrade path";
  const monetizationReason =
    paidRatio >= 35
      ? "搜索结果里付费产品占比不低，说明直接付费心智已经存在。"
      : "免费产品更多，先用免费入口获客再做付费转化更符合当前市场结构。";

  return {
    meta: {
      averageOpportunity,
      averageHighValue,
      averageCompetition,
      averageDemand,
      averageEvidenceConfidence,
      paidRatio,
    },
    opportunities: {
      qualityGap: topKeywords(
        sorted,
        (keyword) =>
          (keyword.highValueSummary?.dimensions.supplyWeakness.score || keyword.marketGapScore) >= 60 &&
          keyword.competitionScore >= 45,
      ),
      staleMarket: topKeywords(
        sorted,
        (keyword) =>
          (keyword.highValueSummary?.dimensions.supplyWeakness.score || keyword.marketGapScore) >= 65 &&
          (keyword.highValueSummary?.dimensions.monetizationEvidence.score || keyword.monetizationScore) >= 50,
      ),
      blueOcean: topKeywords(
        sorted,
        (keyword) =>
          keyword.competitionScore <= 40 &&
          (keyword.highValueSummary?.dimensions.entryFeasibility.score || keyword.opportunityScore) >= 55,
      ),
      dominated: topKeywords(
        sorted,
        (keyword) =>
          keyword.competitionScore >= 70 &&
          (keyword.highValueSummary?.dimensions.supplyWeakness.score || keyword.marketGapScore) <= 40,
      ),
    },
    monetizationModel,
    monetizationReason,
    positioningHints: [
      "优先挑 demand durability 高、supply weakness 明显的词，而不是只看广义热度。",
      "把高供给缺口词做成更窄的场景页，先验证 buildability，再决定是否扩品类。",
      "把评论痛点、榜单热词和关键词结果交叉验证，避免只靠单一搜索面做判断。",
    ],
    roadmap: [
      "先确认前 10 个机会词的落地页点击与留资表现。",
      "对机会词对应的头部竞品做评论抓取，验证痛点是否真实存在。",
      "把高分词按国家复跑，确认机会是否只存在于单一市场。",
    ],
  };
}