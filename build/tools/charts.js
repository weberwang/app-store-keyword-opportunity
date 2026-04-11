import { z } from "zod";
import { analyzeChartTrends, fetchChart } from "../lib/trends.js";
import { err, ok } from "./common.js";
export function registerChartTools(server) {
    server.tool("fetch_chart", "拉取 iTunes App Store 实时榜单（免费榜/付费榜/新上架），返回名次、App 信息和品类。", {
        country: z.string().default("us").describe("国家代码"),
        chart_type: z
            .enum(["top-free", "top-paid", "new-apps"])
            .default("top-free"),
        limit: z.number().int().min(1).max(200).default(100),
        genre_id: z.string().default("").describe("品类 ID，留空表示全品类"),
    }, async ({ country, chart_type, limit, genre_id }) => {
        try {
            const apps = await fetchChart(country, chart_type, limit, genre_id);
            return ok({ count: apps.length, country, chartType: chart_type, apps });
        }
        catch (e) {
            return err(e.message);
        }
    });
    server.tool("analyze_chart", "分析 iTunes 榜单热词、品类热度和变现分布（直接拉取，无需快照文件）。", {
        country: z.string().default("us"),
        chart_type: z
            .enum(["top-free", "top-paid", "new-apps"])
            .default("top-free"),
        limit: z.number().int().min(1).max(200).default(100),
        genre_id: z.string().default(""),
    }, async ({ country, chart_type, limit, genre_id }) => {
        try {
            const apps = await fetchChart(country, chart_type, limit, genre_id);
            const analysis = analyzeChartTrends(apps);
            return ok(analysis);
        }
        catch (e) {
            return err(e.message);
        }
    });
}
//# sourceMappingURL=charts.js.map