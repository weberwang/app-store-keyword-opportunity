# app-store-keyword-opportunity

一个面向 App Store 远程采集与机会判断的 MCP/CLI 工具集，核心目标是把在线抓取、横向比较、评论分析和三条发现路径统一到同一个仓库里：

- 趋势发现：找正在形成的新机会
- 关键词发现：找显性需求里的细分缺口
- 替代发现：找“产品老了但用户还在”的存量替代机会

当前实现同时支持两层能力：

- 远程采集：直接从 Apple 公开端点拉取搜索结果、榜单和评论
- 评分工作流：对趋势、关键词、替代三条路径输出候选机会、证据分项和标准化 brief

当前的选题判断已经升级为面向自研产品决策的高价值模型，核心会显式衡量：

- 需求持续性：这是不是一个能持续存在的需求，而不只是短期热度
- 供给弱点：现有供给是不是老、弱、窄，存在可切入缺口
- 商业化证据：市场里是否已经有付费、订阅或高价值用户信号
- 切入可行性：以当前团队能力和竞争格局，是否存在 buildable whitespace
- 证据可信度：当前判断是否主要建立在公开真值，还是缺少第三方/社区信号

远程采集使用的公开数据源包括：

- iTunes Search API：关键词搜索和 App 详情 lookup
- Apple Marketing Tools RSS：Top Free、Top Paid、New Apps 榜单
- iTunes Customer Reviews RSS：竞品评论抓取

仓库已经整理成适合 npm 发布的形态：

- 可执行入口通过 `bin` 暴露 MCP server 和 CLI
- 模块入口通过包根导出 `runWorkflow`、adapter 和类型定义
- npm 发布内容只包含运行时构建产物与 README，不包含测试文件和 sourcemap

## MCP Tools

服务启动后会暴露两类工具：

| Tool | Description |
| --- | --- |
| `discover_app_topics` | 按 `trend`、`keyword` 或 `replacement` 三种模式执行发现、评分和 brief 生成 |
| `search_keywords` | 远程拉取 App Store 搜索结果并生成关键词机会快照 |
| `query_keywords` | 从关键词快照中做模糊查询和多维过滤，支持按高价值分、来源置信度和估算值过滤 |
| `build_strategy` | 基于关键词快照生成定位、变现和路线图建议，优先使用高价值自研选题模型 |
| `compare_countries` | 对同一组词并发采集多个国家的搜索结果并比较机会分 |
| `fetch_chart` | 远程拉取 App Store 榜单 |
| `analyze_chart` | 分析榜单热词、品类集中度和免费/付费结构 |
| `search_game_keywords` | 专门采集游戏赛道关键词机会，并输出更贴近玩法/细分品类的关键词分析 |
| `analyze_game_heat` | 汇总游戏赛道热度，输出热门子类型、上升中的游戏和厂商热度 |
| `analyze_game_track` | 专门分析游戏赛道的榜单结构、头部厂商集中度、live-ops 节奏、新游晋升和评论痛点 |
| `analyze_reviews` | 远程抓取竞品评论并提炼痛点词、卖点词和评分分布 |

### 远程采集说明

- `search_keywords` 会在线请求 Apple 端点，再把结果保存成本地快照，方便后续 `query_keywords` 和 `build_strategy` 复用
- `fetch_chart`、`analyze_chart`、`analyze_reviews` 是直接联网分析，不依赖本地快照
- 关键词扩展是“远程结果驱动”的轻量扩展，不依赖预置本地词库
- 快照会保留 `marketSignals`、`signalCoverage` 和 `highValueSummary`，用来解释分数来自哪些来源、缺了哪些来源，以及为什么这个方向值得做或暂时不该做
- 如果提供 `aso_snapshot_file` 参数或 `ASO_SNAPSHOT_FILE` 环境变量，关键词快照还会合并外部 ASO provider 的归一化信号
- 如果不想先落盘文件，也可以直接通过 `aso_snapshot` 参数把同样的快照对象传进 `search_keywords`

### 高价值模型输出

关键词快照和 workflow 候选结果除了保留原有 `opportunityScore` 外，还会返回：

- `highValueSummary.overallScore`：更贴近自研 build/no-build 决策的综合分
- `highValueSummary.dimensions`：demandDurability、supplyWeakness、monetizationEvidence、entryFeasibility、evidenceConfidence 五个维度
- `signalCoverage`：当前有哪些来源参与、哪些来源缺失、平均置信度是多少
- `brief.buildThesis` / `brief.blockers` / `brief.confidenceGaps`：为什么值得做、什么在阻塞、还缺什么证据

### 游戏赛道分析

如果你要看游戏市场，而不是泛产品关键词，可以直接使用 `analyze_game_track`：

- 默认分析 `6014=Games` 整体赛道
- 同时拉取 `top-free`、`top-paid`、`new-apps` 三张榜单
- 输出头部厂商集中度、跨榜单头部产品、更新频率、标题热词和新游晋升信号
- 可选抓取头部游戏评论，提炼差评痛点和卖点词

这层分析不是替代 `search_keywords`，而是用于更快判断某个游戏赛道是否拥挤、是否依赖强 live-ops、以及新品是否还有晋升窗口。

如果你要专门看游戏关键词和热度，现在还有两类补充工具：

- `search_game_keywords`：按游戏赛道采集关键词，并输出 demand leader、low competition、monetization leader、buildable whitespace 等视角
- `analyze_game_heat`：从游戏榜单中提取热门子类型、上升中的新游、厂商热度和标题热词

### 外部 ASO 快照接入

如果你已经从外部 ASO provider 导出了归一化 market signals，可以在运行 `search_keywords` 时通过 `aso_snapshot_file` 指向该 JSON 文件，或者设置环境变量 `ASO_SNAPSHOT_FILE`。如果你不想单独整理文件，也可以直接把同样结构的对象放进 `aso_snapshot` 参数。

快照文件最小格式如下：

```json
{
	"providerId": "mock-aso",
	"generatedAt": "2026-04-24T03:00:00.000Z",
	"signals": [
		{
			"entityKind": "keyword",
			"entityId": "habit tracker",
			"metric": "keyword-volume",
			"value": 82,
			"territory": "us",
			"confidence": 76,
			"isEstimated": true,
			"rawMetricKey": "search_volume",
			"rawValue": 14200
		},
		{
			"entityKind": "app",
			"entityId": "1438388363",
			"entityLabel": "Habit Tracker",
			"metric": "download-estimate",
			"value": 64,
			"territory": "us",
			"confidence": 70,
			"isEstimated": true,
			"rawMetricKey": "downloads_estimate",
			"rawValue": 32000
		}
	]
}
```

当前支持导入 `keyword` 和 `app` 两类实体信号，并将它们统一归入 `aso-provider` 来源。

### 输入模式

- `trend`: 传入一组趋势信号，适合榜单、评论动量、分发变化、时机判断
- `keyword`: 传入一个关键词种子和若干 intent/persona/workflow 线索，适合显性需求切分
- `replacement`: 传入一组旧 app 信号，适合寻找陈旧但仍有用户的替代机会

### 输出内容

每个候选机会都会返回：

- 统一的 canonical candidate schema
- 11 个显式 evidence dimensions
- `attractiveness` 与 `confidence` 分离的结果
- `pursue-now` / `validate-next` / `monitor` / `discard` 四层决策
- 标准化 opportunity brief 和 evidence trace

## Setup

开发或本地验证：

```bash
npm install
npm run build
```

如果已经发布到 npm，使用者可以直接运行：

```bash
npx app-store-keyword-opportunity
```

或者使用 CLI 入口：

```bash
npx app-store-keyword-opportunity-cli sample trend
```

启动 MCP server：

```bash
npm run mcp
```

CLI 运行样例：

```bash
npm run sample:trend
npm run sample:keyword
npm run sample:replacement
```

Inspector 调试 MCP 远程采集工具：

```bash
npm run inspector
```

## Programmatic Usage

```ts
import { runWorkflow } from "app-store-keyword-opportunity";

const result = runWorkflow({
	mode: "keyword",
	keywordSeed: {
		seed: "habit tracker",
		targetUser: "people trying to build routines",
		coreProblem: "staying consistent after the first few days",
	},
});

console.log(result.candidates[0]);
```

## VS Code MCP Config

如果你希望直接通过 GitHub 仓库使用，而不是先 clone 到本地，优先使用下面这段配置：

```json
{
	"servers": {
		"app-topic-discovery": {
			"type": "stdio",
			"command": "npx",
			"args": ["-y", "github:weberwang/app-store-keyword-opportunity"]
		}
	}
}
```

这种方式依赖 npm 对 GitHub 仓库安装的支持。当前仓库保留了 `prepare` 脚本，因此通过 `github:owner/repo` 拉起时会自动安装依赖并构建 `build` 产物。

如果你是在本地开发或调试这个仓库，再使用本地模式：

```json
{
	"servers": {
		"app-topic-discovery": {
			"type": "stdio",
			"command": "node",
			"args": ["${workspaceFolder}/build/index.js"]
		}
	}
}
```

## Validation

```bash
npm run typecheck
npm run validate
npm pack --dry-run
```

验证覆盖：

- 趋势路径会产出带 brief 的排序结果
- 关键词路径会优先更窄的 segment，而不是机械保留 broad seed
- 替代路径会过滤掉真正无人使用的 dead app，并显式输出 `supplyFreshness` 与 `replacementPressure`
- Skill 与 MCP adapter 共享同一个 workflow contract
- `npm pack --dry-run` 应包含运行时构建文件、嵌套的 lib/tools 产物和 README

## Project Structure

```text
src/
	index.ts
	api.ts
	cli.ts
	core.ts
	adapter.ts
	samples.ts
	types.ts
	lib/
	tools/
	tests/
		workflow.test.ts
openspec/
	changes/
		create-ai-app-topic-discovery-workflow/
```

## Notes

- 当前实现已经支持远程采集，但依然使用轻量规则评分，不是官方商业情报数据源
- 分数代表结构化判断，不代表真实市场规模预测
- `supplyFreshness` 是供给证据，不是机会正向维度；最终排序会将其反向解释为 stale-supply opportunity
- 缺失证据不会阻止出结果，但会降低 `confidence` 并显式标记缺口