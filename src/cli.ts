#!/usr/bin/env node
import "dotenv/config";
import path from "path";
import { Command } from "commander";
import inquirer from "inquirer";
import { env } from "./lib/env.js";

import { collectKeywordSnapshot } from "./lib/collector.js";
import { readSnapshot, writeSnapshot } from "./lib/json-store.js";
import { queryKeywords } from "./lib/query.js";
import {
  analyzeChartTrends,
  fetchChart,
  enrichSnapshotWithTrends,
  compareSnapshots,
  CHART_TYPES,
} from "./lib/trends.js";
import { buildProductStrategy } from "./lib/insight.js";
import { analyzeCompetitorReviews } from "./lib/review-analysis.js";
import { compareAcrossCountries } from "./lib/country-compare.js";

const program = new Command();
const defaultDataFile = env.dataFile;

interface Choice {
  name: string;
  value: string;
}
const COUNTRY_CHOICES: Choice[] = [
  { name: "美国 (us)", value: "us" },
  { name: "中国 (cn)", value: "cn" },
  { name: "日本 (jp)", value: "jp" },
  { name: "英国 (gb)", value: "gb" },
  { name: "德国 (de)", value: "de" },
  { name: "法国 (fr)", value: "fr" },
  { name: "韩国 (kr)", value: "kr" },
  { name: "澳大利亚 (au)", value: "au" },
  { name: "巴西 (br)", value: "br" },
  { name: "自定义...", value: "__custom__" },
];

interface GenreChoice {
  name: string;
  value: string;
  genreName: string;
}
const GENRE_CHOICES: GenreChoice[] = [
  { name: "全部", value: "", genreName: "" },
  { name: "游戏 (Games)", value: "6014", genreName: "Games" },
  { name: "娱乐 (Entertainment)", value: "6016", genreName: "Entertainment" },
  { name: "教育 (Education)", value: "6017", genreName: "Education" },
  {
    name: "健康健美 (Health & Fitness)",
    value: "6013",
    genreName: "Health & Fitness",
  },
  { name: "效率 (Productivity)", value: "6007", genreName: "Productivity" },
  { name: "生活 (Lifestyle)", value: "6012", genreName: "Lifestyle" },
  {
    name: "社交 (Social Networking)",
    value: "6005",
    genreName: "Social Networking",
  },
  { name: "工具 (Utilities)", value: "6002", genreName: "Utilities" },
  { name: "财务 (Finance)", value: "6015", genreName: "Finance" },
  {
    name: "摄影与录像 (Photo & Video)",
    value: "6008",
    genreName: "Photo & Video",
  },
  { name: "美食佳饮 (Food & Drink)", value: "6023", genreName: "Food & Drink" },
  { name: "旅行 (Travel)", value: "6003", genreName: "Travel" },
  { name: "音乐 (Music)", value: "6011", genreName: "Music" },
  { name: "新闻 (News)", value: "6009", genreName: "News" },
  { name: "图书 (Books)", value: "6018", genreName: "Books" },
  { name: "医疗 (Medical)", value: "6020", genreName: "Medical" },
  { name: "商业 (Business)", value: "6000", genreName: "Business" },
  { name: "体育 (Sports)", value: "6004", genreName: "Sports" },
  { name: "购物 (Shopping)", value: "6024", genreName: "Shopping" },
  { name: "天气 (Weather)", value: "6001", genreName: "Weather" },
];

const GENRE_BY_ID = new Map(GENRE_CHOICES.map((g) => [g.value, g]));

function toIntOrUndefined(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function toFloatOrUndefined(value: string): number | undefined {
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function validatePositiveInt(value: string): boolean | string {
  return Number.isInteger(Number(value)) && Number(value) > 0
    ? true
    : "请输入正整数";
}

// ─────────────────────────────────────────────────────────────
// 采集
// ─────────────────────────────────────────────────────────────
async function runCollect(): Promise<void> {
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "seeds",
      message: "种子关键词（多个用逗号分隔）：",
      validate: (v: string) => (v.trim() ? true : "至少输入一个种子词"),
    },
    {
      type: "list",
      name: "country",
      message: "App Store 国家/地区：",
      choices: COUNTRY_CHOICES,
      default: "us",
    },
    {
      type: "input",
      name: "customCountry",
      message: "请输入自定义国家代码（如 au）：",
      when: (ans: any) => ans.country === "__custom__",
      validate: (v: string) => (v.trim() ? true : "不能为空"),
    },
    {
      type: "list",
      name: "genre",
      message: "App 类型（按类型聚焦采集）：",
      choices: GENRE_CHOICES,
      default: "",
    },
    {
      type: "input",
      name: "language",
      message: "语言代码：",
      default: "en-us",
    },
    {
      type: "input",
      name: "suggestions",
      message: "每个种子词展开联想词数量：",
      default: "10",
      validate: validatePositiveInt,
    },
    {
      type: "input",
      name: "results",
      message: "每个词抓取竞品数量（最多 200）：",
      default: "50",
      validate: validatePositiveInt,
    },
    {
      type: "input",
      name: "details",
      message: "取前几名 App 的详情页补充数据：",
      default: "5",
      validate: validatePositiveInt,
    },
    {
      type: "input",
      name: "concurrency",
      message: "并发采集数量（建议 2-3，避免限流）：",
      default: "2",
      validate: validatePositiveInt,
    },
    {
      type: "input",
      name: "out",
      message: "输出文件路径：",
      default: process.env["DATA_FILE"] || defaultDataFile,
    },
  ]);

  const country =
    answers.country === "__custom__"
      ? answers.customCountry.trim()
      : answers.country;
  console.log("\n[ 开始采集，请稍候... ]\n");

  const snapshot = await collectKeywordSnapshot({
    seeds: answers.seeds
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean),
    country,
    language: answers.language,
    genreId: answers.genre || "",
    suggestionsLimit: Number.parseInt(answers.suggestions, 10),
    resultsLimit: Number.parseInt(answers.results, 10),
    detailLimit: Number.parseInt(answers.details, 10),
    concurrency: Number.parseInt(answers.concurrency, 10),
  });

  const outputFile = path.resolve(answers.out);
  await writeSnapshot(outputFile, snapshot);

  console.log(
    `\n[ 完成 ] 已保存 ${snapshot.meta.totalKeywords} 个关键词到 ${outputFile}\n`,
  );
  console.table(
    snapshot.keywords.slice(0, 10).map((item) => ({
      关键词: item.term,
      需求分: item.demandScore,
      竞争分: item.competitionScore,
      机会分: item.opportunityScore,
      标题精确命中数: item.metrics.exactTitleMatches,
    })),
  );

  const topInsights = snapshot.keywords
    .slice(0, 3)
    .filter((item) => item.insight?.hints?.length);
  if (topInsights.length) {
    console.log(
      "\n━━━━━━━━━━━━━━━━━━ 产品思路洞察（机会分前3名） ━━━━━━━━━━━━━━━━━━\n",
    );
    for (const item of topInsights) {
      const s = (item.insight.summary || {}) as any;
      console.log(
        `【${item.term}】 机会分 ${item.opportunityScore} | 竞品 ${s.appCount ?? "?"} 款 | 均分 ${s.avgScore ?? "?"} | 陈旧 ${s.staleCount ?? 0} 款`,
      );
      for (const hint of item.insight.hints) console.log(`  → ${hint}`);
      console.log();
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 查询
// ─────────────────────────────────────────────────────────────
async function runQuery(): Promise<void> {
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "file",
      message: "数据文件路径：",
      default: process.env["DATA_FILE"] || defaultDataFile,
    },
    { type: "input", name: "q", message: "关键词模糊搜索（直接回车跳过）：" },
    {
      type: "list",
      name: "country",
      message: "国家/地区筛选：",
      choices: [
        { name: "不限", value: "" },
        ...COUNTRY_CHOICES.filter((c) => c.value !== "__custom__"),
      ],
    },
    {
      type: "list",
      name: "genre",
      message: "App 类型筛选：",
      choices: GENRE_CHOICES,
      default: "",
    },
    {
      type: "input",
      name: "include",
      message: "词必须包含某词（逗号分隔，直接回车跳过）：",
    },
    {
      type: "input",
      name: "requireAll",
      message: "词必须同时包含所有词（逗号分隔，直接回车跳过）：",
    },
    {
      type: "input",
      name: "exclude",
      message: "排除含某词的结果（逗号分隔，直接回车跳过）：",
    },
    {
      type: "input",
      name: "minOpportunity",
      message: "最低机会分 0-100（直接回车跳过）：",
    },
    {
      type: "input",
      name: "maxCompetition",
      message: "最高竞争分 0-100（直接回车跳过）：",
    },
    {
      type: "input",
      name: "minDemand",
      message: "最低需求分 0-100（直接回车跳过）：",
    },
    {
      type: "input",
      name: "maxTitleMatches",
      message: "标题精确命中数上限（直接回车跳过）：",
    },
    {
      type: "input",
      name: "maxMedianReviews",
      message: "评分中位数上限（直接回车跳过）：",
    },
    {
      type: "list",
      name: "sortBy",
      message: "排序方式：",
      choices: [
        { name: "机会分（从高到低）", value: "opportunity" },
        { name: "需求分（从高到低）", value: "demand" },
        { name: "竞争分（从低到高）", value: "competition" },
      ],
      default: "opportunity",
    },
    {
      type: "input",
      name: "limit",
      message: "最多显示条数：",
      default: "20",
      validate: validatePositiveInt,
    },
  ]);

  const snapshot = await readSnapshot(path.resolve(answers.file));
  const results = queryKeywords(snapshot, {
    q: answers.q || undefined,
    country: answers.country || undefined,
    category: GENRE_BY_ID.get(answers.genre)?.genreName || undefined,
    include: answers.include || undefined,
    requireAll: answers.requireAll || undefined,
    exclude: answers.exclude || undefined,
    minOpportunity: toFloatOrUndefined(answers.minOpportunity),
    maxCompetition: toFloatOrUndefined(answers.maxCompetition),
    minDemand: toFloatOrUndefined(answers.minDemand),
    maxTitleMatches: toIntOrUndefined(answers.maxTitleMatches),
    maxMedianReviews: toIntOrUndefined(answers.maxMedianReviews),
    sortBy: answers.sortBy,
    limit: Number.parseInt(answers.limit, 10),
  });

  if (!results.length) {
    console.log("\n未找到符合条件的关键词。\n");
    return;
  }

  console.log(`\n共找到 ${results.length} 个关键词：\n`);
  console.table(
    results.map((item) => ({
      关键词: item.term,
      需求分: item.demandScore,
      竞争分: item.competitionScore,
      机会分: item.opportunityScore,
      主要分类: item.topApps[0]?.genre || "未知",
      头部应用: item.topApps[0]?.title || "无",
    })),
  );

  const topInsights = results
    .slice(0, 5)
    .filter((item) => item.insight?.hints?.length);
  if (topInsights.length) {
    console.log(
      "\n━━━━━━━━━━━━━━━━━━ 产品思路洞察（机会分前5名） ━━━━━━━━━━━━━━━━━━\n",
    );
    for (const item of topInsights) {
      const s = (item.insight.summary || {}) as any;
      console.log(
        `【${item.term}】 机会分 ${item.opportunityScore} | 竞品 ${s.appCount ?? "?"} 款（免费 ${s.freeCount ?? "?"}/${s.paidCount ?? "?"}付费）| 均分 ${s.avgScore ?? "?"}`,
      );
      for (const hint of item.insight.hints) console.log(`  → ${hint}`);
      console.log();
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 热度趋势
// ─────────────────────────────────────────────────────────────
async function runTrend(): Promise<void> {
  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "genre",
      message: "App 类型（筛选榜单范围）：",
      choices: GENRE_CHOICES,
      default: "",
    },
    {
      type: "checkbox",
      name: "chartTypes",
      message: "选择要抓取的榜单（空格选中，回车确认）：",
      choices: Object.entries(CHART_TYPES).map(
        ([value, info]: [string, any]) => ({
          name: `${info.label} 100`,
          value,
        }),
      ),
      default: ["top-free"],
      validate: (v: string[]) => (v.length ? true : "至少选择一个榜单"),
    },
    {
      type: "list",
      name: "country",
      message: "榜单国家/地区：",
      choices: COUNTRY_CHOICES.filter((c) => c.value !== "__custom__"),
      default: "us",
    },
    {
      type: "input",
      name: "limit",
      message: "展示热词数量：",
      default: "20",
      validate: validatePositiveInt,
    },
  ]);

  console.log("\n[ 正在拉取 iTunes 实时榜单... ]\n");

  const chartResults = await Promise.all(
    answers.chartTypes.map(async (type: string) => {
      try {
        const apps = await fetchChart(
          answers.country,
          type,
          100,
          answers.genre || "",
        );
        return { type, label: (CHART_TYPES as any)[type]?.label || type, apps };
      } catch (e: any) {
        return {
          type,
          label: (CHART_TYPES as any)[type]?.label || type,
          apps: [],
          error: e.message,
        };
      }
    }),
  );

  const mergedMap = new Map<string, any>();
  for (const { apps } of chartResults) {
    for (const app of apps) {
      if (!mergedMap.has(app.id) || mergedMap.get(app.id).rank > app.rank) {
        mergedMap.set(app.id, app);
      }
    }
  }
  const allApps = [...mergedMap.values()];

  for (const chart of chartResults) {
    console.log(
      chart.error
        ? `  ! ${chart.label}：${chart.error}`
        : `  √ ${chart.label} ${chart.apps.length} 条`,
    );
  }
  const genreLabel = GENRE_BY_ID.get(answers.genre || "")?.name || "全部";
  console.log(
    `  合并后共 ${allApps.length} 款 App | 分析范围：${genreLabel}\n`,
  );

  if (!allApps.length) {
    console.log("榜单数据为空，请检查网络或换个国家/地区重试。");
    return;
  }

  const analysis = analyzeChartTrends(allApps);
  const limit = Number.parseInt(answers.limit, 10);

  if (!answers.genre) {
    console.log("── 当前榜单分类热度 ──\n");
    console.table(
      analysis.topCategories.map((c) => ({
        分类: c.category,
        上榜数量: c.count,
        占比: `${c.ratio}%`,
      })),
    );
  }

  const genreSuffix = answers.genre ? ` · ${genreLabel}` : "";
  console.log(`── 上榜 App 标题高频词${genreSuffix}（可作为种子词参考）──\n`);
  console.table(
    analysis.topWords
      .slice(0, limit)
      .map((w) => ({
        热词: w.word,
        出现次数: w.count,
        最高榜位: w.bestRank ?? "-",
        示例应用: w.exampleApps[0] || "-",
      })),
  );

  const m = analysis.monetization;
  console.log(
    `\n变现格局：免费 ${m.freeCount} 款 / 付费 ${m.paidCount} 款${m.paidCount ? ` | 付费均价 $${m.avgPaidPrice}` : ""}`,
  );
  console.log(`数据时间：${analysis.fetchedAt}\n`);

  if (analysis.topWords.length) {
    console.log(`提示：可将以上热词作为种子词运行「采集」，挖掘细分机会词。`);
    console.log(
      `参考种子词：${analysis.topWords
        .slice(0, 5)
        .map((w) => w.word)
        .join(", ")}\n`,
    );
  }
}

// ─────────────────────────────────────────────────────────────
// 快照对比
// ─────────────────────────────────────────────────────────────
async function runCompare(): Promise<void> {
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "oldFile",
      message: "旧快照文件路径（基准）：",
      validate: (v: string) => (v.trim() ? true : "不能为空"),
    },
    {
      type: "input",
      name: "newFile",
      message: "新快照文件路径（对比）：",
      default: process.env["DATA_FILE"] || defaultDataFile,
    },
    {
      type: "list",
      name: "genre",
      message: "App 类型筛选（只对比该类型的关键词）：",
      choices: GENRE_CHOICES,
      default: "",
    },
    {
      type: "list",
      name: "focus",
      message: "重点显示：",
      choices: [
        { name: "机会分上升最多", value: "rising" },
        { name: "机会分下降最多", value: "falling" },
        { name: "新出现的词", value: "new" },
        { name: "全部变化", value: "all" },
      ],
      default: "rising",
    },
    {
      type: "input",
      name: "limit",
      message: "显示条数：",
      default: "20",
      validate: validatePositiveInt,
    },
  ]);

  const [oldSnapshot, newSnapshot] = await Promise.all([
    readSnapshot(path.resolve(answers.oldFile)),
    readSnapshot(path.resolve(answers.newFile)),
  ]);

  const delta = compareSnapshots(oldSnapshot, newSnapshot);
  const limit = Number.parseInt(answers.limit, 10);
  const genreFilter = GENRE_BY_ID.get(answers.genre)?.genreName || "";

  let filtered: any[] = delta;
  if (genreFilter) {
    filtered = filtered.filter(
      (d) =>
        Array.isArray(d.topApps) &&
        d.topApps.some((a: any) =>
          (a.genre || "").toLowerCase().includes(genreFilter.toLowerCase()),
        ),
    );
  }
  if (answers.focus === "rising") {
    filtered = filtered
      .filter((d) => d.status === "updated" && d.opportunityDelta > 0)
      .sort((a, b) => b.opportunityDelta - a.opportunityDelta);
  } else if (answers.focus === "falling") {
    filtered = filtered
      .filter((d) => d.status === "updated" && d.opportunityDelta < 0)
      .sort((a, b) => a.opportunityDelta - b.opportunityDelta);
  } else if (answers.focus === "new") {
    filtered = filtered.filter((d) => d.status === "new");
  }

  const shown = filtered.slice(0, limit);
  if (!shown.length) {
    console.log("\n没有符合条件的变化记录。\n");
    return;
  }

  const oldDate = oldSnapshot.meta?.generatedAt?.slice(0, 10) || "旧";
  const newDate = newSnapshot.meta?.generatedAt?.slice(0, 10) || "新";
  console.log(`\n对比：${oldDate} → ${newDate}\n`);

  if (answers.focus === "new") {
    console.table(
      shown.map((item) => ({
        关键词: item.term,
        需求分: item.demandScore,
        竞争分: item.competitionScore,
        机会分: item.opportunityScore,
      })),
    );
  } else {
    console.table(
      shown.map((item) => ({
        关键词: item.term,
        机会分变化:
          item.opportunityDelta != null
            ? item.opportunityDelta > 0
              ? `+${item.opportunityDelta}`
              : String(item.opportunityDelta)
            : "新",
        需求分变化:
          item.demandDelta != null
            ? item.demandDelta > 0
              ? `+${item.demandDelta}`
              : String(item.demandDelta)
            : "-",
        当前机会分: item.opportunityScore,
      })),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// 产品策略报告
// ─────────────────────────────────────────────────────────────
async function runStrategy(): Promise<void> {
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "file",
      message: "数据文件路径：",
      default: process.env["DATA_FILE"] || defaultDataFile,
    },
    {
      type: "list",
      name: "genre",
      message: "聚焦分析的 App 类型：",
      choices: GENRE_CHOICES,
      default: "",
    },
    {
      type: "input",
      name: "minOpportunity",
      message: "纳入分析的最低机会分（0-100）：",
      default: "40",
      validate: validatePositiveInt,
    },
  ]);

  const snapshot = await readSnapshot(path.resolve(answers.file));
  const genreName = GENRE_BY_ID.get(answers.genre || "")?.genreName || "";
  const minOpp = Number.parseInt(answers.minOpportunity, 10);

  let keywords = Array.isArray(snapshot.keywords) ? snapshot.keywords : [];
  if (genreName) {
    keywords = keywords.filter(
      (kw) =>
        Array.isArray(kw.topApps) &&
        kw.topApps.some((a) =>
          (a.genre || "").toLowerCase().includes(genreName.toLowerCase()),
        ),
    );
  }
  keywords = keywords.filter((kw) => kw.opportunityScore >= minOpp);

  if (!keywords.length) {
    console.log(
      "\n没有符合条件的关键词，请降低最低机会分或先运行「采集」获取数据。\n",
    );
    return;
  }

  const strategy = buildProductStrategy(keywords);
  if (!strategy) {
    console.log("\n数据不足，无法生成策略报告。\n");
    return;
  }

  const genreLabel = GENRE_BY_ID.get(answers.genre || "")?.name || "全品类";
  const dataDate = snapshot.meta?.generatedAt?.slice(0, 10) || "未知";

  console.log("\n╭──────────────────────────────────────────╮");
  console.log(`\u2502  产品策略报告  ·  ${genreLabel}  ·  ${dataDate}`);
  console.log(
    `\u2502  分析关键词 ${strategy.meta.totalKeywords} 个  |  平均机会分 ${strategy.meta.avgOpportunityScore}`,
  );
  console.log("╰──────────────────────────────────────────╯\n");

  console.log("▼ 机会词盘点\n");
  const bucketLabels: Record<string, string> = {
    qualityGap: "★ 质量洼地（需求真实 + 现有 App 差）",
    staleMarket: "★ 市场陈旧（头部长期不更新）",
    blueOcean: "★ 蓝海空白（竞争极低 + 需求确实）",
    dominated: "⚠ 大厂占位（需差异化切入）",
  };
  let hasOpportunity = false;
  for (const [key, label] of Object.entries(bucketLabels)) {
    const items = (strategy.opportunities as any)[key] as any[];
    if (!items.length) continue;
    hasOpportunity = true;
    console.log(label);
    console.table(
      items.map((kw: any) => ({
        关键词: kw.term,
        机会分: kw.opportunityScore,
        需求分: kw.demandScore,
        竞争分: kw.competitionScore,
        洞察: kw.insight?.hints?.[0]?.slice(0, 40) + "…" || "-",
      })),
    );
  }
  if (!hasOpportunity)
    console.log("  未找到明确划分的机会词，建议降低最低机会分或扩大种子词。\n");

  console.log(
    `\n▼ 推荐变现模式\n  模式：${strategy.monetizationModel}\n  依据：${strategy.monetizationReason}\n`,
  );
  console.log(`▼ 产品定位建议\n`);
  for (const hint of strategy.positioningHints) console.log(`  ${hint}`);

  console.log(`\n▼ 分阶段行动路线图\n`);
  for (const stage of strategy.roadmap) {
    console.log(`  ■ ${stage.phase}`);
    for (const action of stage.actions) console.log(`    • ${action}`);
    console.log();
  }
}

// ─────────────────────────────────────────────────────────────
// 评论情感分析
// ─────────────────────────────────────────────────────────────
async function runReview(): Promise<void> {
  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "source",
      message: "分析来源：",
      choices: [
        {
          name: "从已采集的数据文件选关键词（自动取其竞品 App）",
          value: "snapshot",
        },
        { name: "直接输入 App ID（逗号分隔）", value: "ids" },
      ],
      default: "snapshot",
    },
    {
      type: "input",
      name: "file",
      message: "数据文件路径：",
      default: process.env["DATA_FILE"] || defaultDataFile,
      when: (ans: any) => ans.source === "snapshot",
    },
    {
      type: "input",
      name: "keyword",
      message: "要分析哪个关键词（从文件中搜索）：",
      when: (ans: any) => ans.source === "snapshot",
      validate: (v: string) => (v.trim() ? true : "不能为空"),
    },
    {
      type: "input",
      name: "appIds",
      message: "App ID 列表（逗号分隔）：",
      when: (ans: any) => ans.source === "ids",
      validate: (v: string) => (v.trim() ? true : "不能为空"),
    },
    {
      type: "list",
      name: "country",
      message: "评论国家/地区：",
      choices: COUNTRY_CHOICES.filter((c) => c.value !== "__custom__"),
      default: "us",
    },
    {
      type: "input",
      name: "appCount",
      message: "选取竞品 App 数量（最多 5）：",
      default: "3",
      validate: (v: string) => {
        const n = Number.parseInt(v, 10);
        return n >= 1 && n <= 5 ? true : "请输入1-5的数字";
      },
      when: (ans: any) => ans.source === "snapshot",
    },
  ]);

  let targetApps: Array<{ id: string; title: string }> = [];

  if (answers.source === "snapshot") {
    const snapshot = await readSnapshot(path.resolve(answers.file));
    const keyword = answers.keyword.trim().toLowerCase();
    const kw = (snapshot.keywords || []).find(
      (k) =>
        k.term.toLowerCase().includes(keyword) ||
        keyword.includes(k.term.toLowerCase()),
    );
    if (!kw || !kw.topApps?.length) {
      console.log(
        `\n未找到关键词「${answers.keyword}」的数据，请先运行「采集」。\n`,
      );
      return;
    }
    const count = Number.parseInt(answers.appCount || "3", 10);
    targetApps = kw.topApps
      .slice(0, count)
      .map((a) => ({ id: a.id, title: a.title }));
    console.log(`\n将分析「${kw.term}」的前 ${targetApps.length} 个竞品 App：`);
    for (const a of targetApps) console.log(`  - ${a.title} (${a.id})`);
  } else {
    targetApps = answers.appIds
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean)
      .map((id: string) => ({ id, title: id }));
  }

  console.log("\n[ 正在拉取评论数据，请稍候... ]\n");
  const result = await analyzeCompetitorReviews(targetApps, {
    country: answers.country,
    pages: 3,
  });
  console.log(
    `  共获取 ${result.reviewsFetched} 条评论 | 数据时间：${result.analyzedAt.slice(0, 10)}\n`,
  );

  console.log("── 竞品 App 评论概况 ──\n");
  console.table(
    result.appSummaries.map((a) => ({
      App: a.title.slice(0, 25),
      获取评论数: a.reviewsFetched,
      好评数: a.positiveCount,
      差评数: a.negativeCount,
      平均分: a.avgScore ?? "-",
      总评分数: a.totalRatings ?? "-",
    })),
  );

  const total = result.totalRatings;
  if (total > 0) {
    console.log("── 评分分布（多款竞品汇总）──\n");
    for (const star of [5, 4, 3, 2, 1]) {
      const cnt = result.ratingHistogram[star] || 0;
      const pct = total ? Math.round((cnt / total) * 100) : 0;
      const bar = "█".repeat(Math.round(pct / 2));
      console.log(
        `  ${"★".repeat(star)}${"☆".repeat(5 - star)}  ${String(pct).padStart(3)}%  ${bar}  (${cnt.toLocaleString()})`,
      );
    }
    console.log();
  }

  if (result.painPoints.length) {
    console.log("── 差评痛点词（用户最不满的方面）──\n");
    console.table(
      result.painPoints
        .slice(0, 10)
        .map((w) => ({
          痛点词: w.word,
          差评出现次数: w.count,
          示例: result.painExamples.get(w.word) || "-",
        })),
    );
    console.log("  → 上述痛点是你产品需要重点解决的问题\n");
  }

  if (result.sellingPoints.length) {
    console.log("── 好评卖点词（用户最喜欢的特能）──\n");
    console.table(
      result.sellingPoints
        .slice(0, 10)
        .map((w) => ({ 卖点词: w.word, 好评出现次数: w.count })),
    );
    console.log("  → 上述卖点是你产品需要保留并强化的功能\n");
  }
}

// ─────────────────────────────────────────────────────────────
// 多国市场对比
// ─────────────────────────────────────────────────────────────
async function runCountryCompare(): Promise<void> {
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "terms",
      message: "要对比的关键词（逗号分隔，建议不超过 5 个）：",
      validate: (v: string) => (v.trim() ? true : "不能为空"),
    },
    {
      type: "checkbox",
      name: "countries",
      message: "选择要对比的国家/地区（默认全选）：",
      choices: COUNTRY_CHOICES.filter((c) => c.value !== "__custom__"),
      default: ["us", "cn", "jp", "gb", "de"],
    },
    {
      type: "list",
      name: "genre",
      message: "App 类型限定（可选）：",
      choices: GENRE_CHOICES,
      default: "",
    },
  ]);

  const terms = answers.terms
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);
  const countries = answers.countries.length
    ? answers.countries
    : ["us", "cn", "jp", "gb", "de"];

  console.log(
    `\n[ 正在对比 ${terms.length} 个词 × ${countries.length} 个国家（${terms.length * countries.length} 次请求），请稍候... ]\n`,
  );

  const result = await compareAcrossCountries(terms, countries, {
    genreId: answers.genre || "",
    concurrency: 3,
  });

  console.log("── 各国市场整体机会得分（越高越容易切入）──\n");
  console.table(
    result.countrySummaries.map((c) => ({
      国家: c.country.toUpperCase(),
      平均机会分: c.avgOpportunity,
      平均竞争分: c.avgCompetition,
      竞品平均评分: c.avgAppScore,
    })),
  );
  const best = result.countrySummaries[0];
  if (best)
    console.log(
      `  → 整体最适合备战的市场：「${best.country.toUpperCase()}」（平均机会分 ${best.avgOpportunity}）\n`,
    );

  console.log("── 各关键词最佳市场──\n");
  for (const ts of result.termSummaries) {
    console.log(
      `【${ts.term}】→ 最佳国家：${ts.bestCountry.toUpperCase()} (机会分 ${ts.bestOpportunityScore})`,
    );
    console.table(
      ts.countryResults.map((r) => ({
        国家: r.country.toUpperCase(),
        机会分: r.opportunityScore,
        竞争分: r.competitionScore,
        需求分: r.demandScore,
        竞品平均分: r.avgAppScore,
        免费占比: `${r.freeRatio}%`,
        第一竞品: (r.topApp?.title || "-").slice(0, 22),
      })),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// 主菜单
// ─────────────────────────────────────────────────────────────
async function mainMenu(): Promise<void> {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║   App Store 关键词机会分析工具        ║");
  console.log("╚══════════════════════════════════════╝\n");

  while (true) {
    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "请选择操作：",
        choices: [
          { name: "1. 采集关键词数据", value: "collect" },
          { name: "2. 查询与筛选结果", value: "query" },
          { name: "3. 实时热度分析（iTunes 榜单）", value: "trend" },
          { name: "4. 快照对比 · 追踪变化", value: "compare" },
          { name: "5. 产品策略报告（指导研发决策）", value: "strategy" },
          { name: "6. 竞品评论情感分析", value: "review" },
          { name: "7. 多国市场对比", value: "country-compare" },
          new (inquirer as any).Separator(),
          { name: "退出", value: "exit" },
        ],
      },
    ]);

    if (action === "exit") {
      console.log("\n再见！\n");
      process.exit(0);
    }

    console.log();
    try {
      if (action === "collect") await runCollect();
      else if (action === "query") await runQuery();
      else if (action === "trend") await runTrend();
      else if (action === "compare") await runCompare();
      else if (action === "strategy") await runStrategy();
      else if (action === "review") await runReview();
      else if (action === "country-compare") await runCountryCompare();
    } catch (e: any) {
      console.error(`\n错误：${e.message}\n`);
    }

    console.log("\n─────────────────────────────────────\n");
  }
}

// ─────────────────────────────────────────────────────────────
// 入口
// ─────────────────────────────────────────────────────────────
program
  .name("app-store-keyword-opportunity")
  .version("0.1.0")
  .description("App Store 关键词机会分析工具");

program.command("collect").description("采集关键词数据").action(runCollect);
program.command("query").description("查询与筛选结果").action(runQuery);
program.command("trend").description("实时热度分析").action(runTrend);
program.command("compare").description("快照对比追踪").action(runCompare);
program.command("strategy").description("产品策略报告").action(runStrategy);
program.command("review").description("竞品评论情感分析").action(runReview);
program
  .command("country-compare")
  .description("多国市场对比")
  .action(runCountryCompare);
program.command("menu").description("交互式主菜单（默认）").action(mainMenu);

if (process.argv.length <= 2) {
  mainMenu().catch((e: any) => {
    console.error(`错误：${e.message}`);
    process.exitCode = 1;
  });
} else {
  program.parseAsync(process.argv).catch((e: any) => {
    console.error(`错误：${e.message}`);
    process.exitCode = 1;
  });
}
