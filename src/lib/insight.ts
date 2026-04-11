// 基于采集数据生成产品方向洞察

import type {
  AppInfo,
  KeywordResult,
  MarketInsight,
  ProductStrategy,
} from "../types";

const STALE_MONTHS = 12;

function monthsAgo(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return (
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24 * 30)
  );
}

export function computeMarketInsight(
  keyword: string,
  topApps: AppInfo[],
): MarketInsight {
  if (!topApps.length) {
    return {
      hints: ["搜索结果为空，可能是极细分市场，需人工验证需求是否真实存在。"],
    };
  }

  const hints: string[] = [];

  const qualityGapApps = topApps.filter(
    (app) => app.reviews >= 500 && app.score > 0 && app.score < 3.8,
  );
  const qualityGap = qualityGapApps.length > 0;
  if (qualityGap) {
    const worstScore = Math.min(...qualityGapApps.map((a) => a.score)).toFixed(
      1,
    );
    hints.push(
      `质量洼地：${qualityGapApps.length} 款现有 App 评分低于 3.8（最低 ${worstScore}★）但下载量可观，` +
        `用户有真实需求却普遍不满意——做一个体验更好的版本有直接的替换机会。`,
    );
  }

  const staleApps = topApps.filter((app) => {
    const age = monthsAgo(app.updatedAt);
    return age !== null && age > STALE_MONTHS;
  });
  const staleRatio = staleApps.length / topApps.length;
  if (staleRatio >= 0.5) {
    hints.push(
      `市场陈旧：前 ${topApps.length} 名中有 ${staleApps.length} 款（${Math.round(staleRatio * 100)}%）超过 1 年未更新，` +
        `头部产品维护意愿低，新产品持续迭代即可建立差距。`,
    );
  }

  const devCount = new Map<string, number>();
  for (const app of topApps) {
    if (app.developer)
      devCount.set(app.developer, (devCount.get(app.developer) || 0) + 1);
  }
  const topDev = [...devCount.entries()].sort((a, b) => b[1] - a[1])[0];
  const uniqueDevs = devCount.size;

  if (topDev && topDev[1] >= 3) {
    hints.push(
      `大厂占位：「${topDev[0]}」在搜索结果中占据 ${topDev[1]} 个位置，` +
        `市场存在强势玩家——差异化定位（细分人群或功能点）比正面竞争更有效。`,
    );
  } else if (uniqueDevs >= topApps.length * 0.8) {
    hints.push(
      `分散市场：前 ${topApps.length} 名由 ${uniqueDevs} 个不同开发者瓜分，无明显龙头——` +
        `市场仍处于混战期，有机会通过品牌和体验建立认知。`,
    );
  }

  const paidApps = topApps.filter((app) => !app.free);
  const freeRatio = (topApps.length - paidApps.length) / topApps.length;
  if (freeRatio === 1) {
    hints.push(
      `全免费格局：前 ${topApps.length} 名均为免费 App，付费专区尚属空白——` +
        `如果功能价值高，直接以付费或订阅切入，用户付费意愿未经验证但竞争少。`,
    );
  } else if (freeRatio < 0.3) {
    const avgPrice = (
      paidApps.reduce((sum, a) => sum + a.price, 0) / paidApps.length
    ).toFixed(2);
    hints.push(
      `付费主导格局：${paidApps.length} 款主流 App 为付费模式，平均定价 $${avgPrice}——` +
        `市场已验证用户愿意为此付费，可参考定价区间。`,
    );
  }

  const ratings = topApps
    .map((a) => a.contentRating)
    .filter(Boolean) as string[];
  const has17plus = ratings.filter((r) => r === "17+").length;
  const allKidFriendly = ratings.length > 0 && ratings.every((r) => r === "4+");
  if (has17plus >= 2) {
    hints.push(
      `成人内容聚集：多款竞品内容评级为 17+，若你做全年龄段版本，可在分类搜索中独占差异化位置。`,
    );
  } else if (allKidFriendly) {
    hints.push(
      `全年龄/儿童向市场：竞品评级均为 4+，家长和教育机构是主要目标用户，家庭订阅是合理变现方向。`,
    );
  }

  if (paidApps.length > 0 && freeRatio > 0.3 && freeRatio < 0.7) {
    const avgPaid = paidApps.reduce((s, a) => s + a.price, 0) / paidApps.length;
    if (avgPaid > 4) {
      hints.push(
        `高价空缺：市面付费 App 平均定价 $${avgPaid.toFixed(2)}，$1.99-$2.99 价格带可能存在空缺——` +
          `低价切入更易获取首批用户和评价。`,
      );
    }
  }

  if (!hints.length) {
    hints.push(
      `市场格局较均衡，建议深入阅读头部 App 的差评（1-2 星评论），` +
        `找到用户最频繁抱怨的功能点作为差异化切入口。`,
    );
  }

  const summary = {
    appCount: topApps.length,
    freeCount: topApps.length - paidApps.length,
    paidCount: paidApps.length,
    avgScore: topApps.length
      ? parseFloat(
          (topApps.reduce((s, a) => s + a.score, 0) / topApps.length).toFixed(
            2,
          ),
        )
      : 0,
    uniqueDevs,
    staleCount: staleApps.length,
    qualityGap,
    topDeveloper: topDev ? topDev[0] : null,
    topDeveloperAppCount: topDev ? topDev[1] : 0,
  };

  return { summary, hints };
}

export function buildProductStrategy(
  keywords: KeywordResult[],
): ProductStrategy | null {
  if (!keywords?.length) return null;

  const buckets = {
    qualityGap: [] as KeywordResult[],
    staleMarket: [] as KeywordResult[],
    blueOcean: [] as KeywordResult[],
    dominated: [] as KeywordResult[],
  };

  for (const kw of keywords) {
    const s = kw.insight?.summary;
    if (kw.opportunityScore < 30) continue;
    if (s?.qualityGap) {
      buckets.qualityGap.push(kw);
    } else if ((s?.staleCount ?? 0) >= 2 && kw.competitionScore < 60) {
      buckets.staleMarket.push(kw);
    } else if (kw.competitionScore < 30 && kw.demandScore > 40) {
      buckets.blueOcean.push(kw);
    } else if ((s?.topDeveloperAppCount ?? 0) >= 3) {
      buckets.dominated.push(kw);
    }
  }

  const topOf = (arr: KeywordResult[]) =>
    [...arr]
      .sort((a, b) => b.opportunityScore - a.opportunityScore)
      .slice(0, 3);

  const opportunities = {
    qualityGap: topOf(buckets.qualityGap),
    staleMarket: topOf(buckets.staleMarket),
    blueOcean: topOf(buckets.blueOcean),
    dominated: topOf(buckets.dominated),
  };

  const allTopApps = keywords.flatMap((kw) => kw.topApps || []);
  const paidTotal = allTopApps.filter((a) => !a.free).length;
  const freeRatio = allTopApps.length
    ? (allTopApps.length - paidTotal) / allTopApps.length
    : 1;
  const avgPaidPrice = paidTotal
    ? allTopApps.filter((a) => !a.free).reduce((s, a) => s + a.price, 0) /
      paidTotal
    : 0;

  let monetizationModel: string;
  let monetizationReason: string;
  if (freeRatio > 0.85) {
    monetizationModel = "免费 + 订阅（Freemium）";
    monetizationReason = `竞品 ${Math.round(freeRatio * 100)}% 为免费，直接付费风险高；以免费降低下载门槛，核心高频功能走订阅（月/年费 $2.99-$9.99 区间）。`;
  } else if (freeRatio < 0.4) {
    monetizationModel = `一次性付费（Buy Once）$${Math.min(avgPaidPrice, 4.99).toFixed(2)} 起`;
    monetizationReason = `市场已验证付费意愿（竞品 ${Math.round((1 - freeRatio) * 100)}% 为付费），用户接受直接购买；低于竞品均价 $${avgPaidPrice.toFixed(2)} 可快速获取首批评价。`;
  } else {
    monetizationModel = "免费 + 一次性内购解锁（Lifetime）";
    monetizationReason = `市场付费比例适中，"先免费体验、再一次性解锁"转化率通常高于订阅，适合功能完整、不需要持续服务的工具类产品。`;
  }

  const avgScore = allTopApps.length
    ? allTopApps.reduce((s, a) => s + (a.score || 0), 0) / allTopApps.length
    : 0;

  const positioningHints: string[] = [];
  if (avgScore > 0 && avgScore < 4.0) {
    positioningHints.push(
      `**体验优先**：竞品平均评分 ${avgScore.toFixed(1)} 分偏低，重点投入流畅度和核心流程，目标上架后评分稳定在 4.5+。`,
    );
  } else {
    positioningHints.push(
      `**功能差异化**：竞品整体评分尚可（${avgScore.toFixed(1)}），靠体验难以脱颖而出，需在功能维度找到竞品尚未覆盖的场景（查阅竞品 1-2 星差评）。`,
    );
  }

  const topOpportunity = [...keywords].sort(
    (a, b) => b.opportunityScore - a.opportunityScore,
  )[0];
  if (topOpportunity) {
    const seeds = topOpportunity.seeds || [];
    positioningHints.push(
      `**最优切入词**：「${topOpportunity.term}」（机会分 ${topOpportunity.opportunityScore}，竞争分 ${topOpportunity.competitionScore}）——以此为核心功能命名，利于 ASO 自然搜索。`,
    );
    if (seeds.length) {
      positioningHints.push(
        `**种子市场**：从「${seeds.slice(0, 2).join("」「")}」这类搜索词的用户出发，理解他们的场景与痛点，MVP 只做这一件事、做到极致。`,
      );
    }
  }

  const allOpps = [
    ...buckets.qualityGap,
    ...buckets.staleMarket,
    ...buckets.blueOcean,
  ].sort((a, b) => b.opportunityScore - a.opportunityScore);

  const phase1Keywords = allOpps.slice(0, 5).map((k) => k.term);
  const phase2Keywords = keywords
    .filter((k) => k.competitionScore < 50 && k.demandScore > 50)
    .filter((k) => !phase1Keywords.includes(k.term))
    .slice(0, 5)
    .map((k) => k.term);

  const roadmap = [
    {
      phase: "第一阶段（0-3个月）：验证 MVP",
      actions: [
        `以「${phase1Keywords.slice(0, 3).join("」「") || "核心关键词"}」为主攻，功能只覆盖这些词的核心场景`,
        "发布后重点邀评，目标获得 50+ 真实评价",
        `ASO 标题精确包含最优机会词「${topOpportunity?.term || ""}」`,
        "观察用户使用数据，找出最高频的 3 个操作路径",
      ],
    },
    {
      phase: "第二阶段（3-6个月）：扩大覆盖",
      actions: [
        `扩展支持关键词：${phase2Keywords.join("、") || "根据用户反馈确定"}`,
        "根据 1-2 星差评修复头部竞品的痛点",
        "A/B 测试截图和副标题，提升搜索点击率（CVR）",
        "建立品牌词 + In-App 分享/推荐机制，降低获客成本",
      ],
    },
    {
      phase: "第三阶段（6个月+）：建立壁垒",
      actions: [
        "积累 500+ 评价后申请苹果「今日推荐」或参与专题活动",
        "分析留存数据，确定核心留存功能并深度强化",
        "开发平台特性（Widget/Shortcut/Watch），竞争优势难以低成本复制",
        "探索企业/团队版本，提升 LTV 和定价天花板",
      ],
    },
  ];

  return {
    opportunities,
    monetizationModel,
    monetizationReason,
    positioningHints,
    roadmap,
    meta: {
      totalKeywords: keywords.length,
      avgOpportunityScore: Math.round(
        keywords.reduce((s, k) => s + k.opportunityScore, 0) / keywords.length,
      ),
      topOpportunityTerm: topOpportunity?.term || "",
    },
  };
}
