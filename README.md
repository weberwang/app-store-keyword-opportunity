# app-store-keyword-opportunity

> GitHub: https://github.com/weberwang/app-store-keyword-opportunity

一个面向 App Store 关键词机会挖掘的 MCP server。它把公开可获取的 App Store 数据组织成一组可调用工具，用来完成关键词机会分析、榜单热度分析、竞品评论分析、多国市场对比和产品策略推导。

## Tools

| Tool | Description |
| --- | --- |
| `search_keywords` | 从种子词采集关键词机会快照，并默认保存到 `DATA_FILE` |
| `query_keywords` | 从本地快照文件查询、筛选关键词 |
| `fetch_chart` | 拉取 iTunes App Store 榜单 |
| `analyze_chart` | 分析榜单热词、品类热度和变现结构 |
| `analyze_reviews` | 提取竞品评论中的差评痛点和好评卖点 |
| `compare_countries` | 横向比较多个国家市场的切入机会 |
| `build_strategy` | 从关键词快照生成产品策略报告 |

## Setup

无需本地发布到 npm，直接从 GitHub 运行：

```bash
npx github:weberwang/app-store-keyword-opportunity
```

或者 clone 到本地后编译运行：

```bash
git clone https://github.com/weberwang/app-store-keyword-opportunity.git
cd app-store-keyword-opportunity
npm install
npm run build
```

## Required Environment

这个 server 不依赖第三方私有 API key，直接使用公开可访问的 App Store / iTunes 数据。

| Variable | Required | Purpose |
| --- | --- | --- |
| `OUTPUT_DIR` | Optional | 输出目录，默认 `./data` |
| `DATA_FILE` | Optional | 关键词快照文件，默认 `OUTPUT_DIR/keywords.json` |

默认情况下：

- `search_keywords` 会把采集结果保存到 `DATA_FILE`
- `query_keywords` 和 `build_strategy` 会默认读取 `DATA_FILE`

## VS Code MCP Config

把下面内容加到 `.vscode/mcp.json`：

```json
{
	"servers": {
		"app-store-keyword": {
			"type": "stdio",
			"command": "npx",
			"args": ["-y", "github:weberwang/app-store-keyword-opportunity"],
			"env": {
				"OUTPUT_DIR": "${workspaceFolder}/data",
				"DATA_FILE": "${workspaceFolder}/data/keywords.json"
			}
		}
	}
}
```

如果你已经把仓库 clone 到本地，使用 `node` 直接启动构建产物：

```json
{
	"servers": {
		"app-store-keyword": {
			"type": "stdio",
			"command": "node",
			"args": ["/path/to/app-store-keyword-opportunity/build/index.js"],
			"env": {
				"OUTPUT_DIR": "${workspaceFolder}/data",
				"DATA_FILE": "${workspaceFolder}/data/keywords.json"
			}
		}
	}
}
```

Windows 本地示例：

```json
{
	"servers": {
		"app-store-keyword": {
			"type": "stdio",
			"command": "node",
			"args": ["D:/Projects/nodejs/app-store-keyword-opportunity/build/index.js"]
		}
	}
}
```

## CLI

项目仍然保留本地 CLI，适合手动分析：

```bash
npm run menu
npm run collect
npm run query
npm run trend
npm run compare
npm run strategy
npm run review
npm run country-compare
```

## Workflow Order

```text
search_keywords  ->  query_keywords  ->  build_strategy
			 ↓
	fetch_chart / analyze_chart
			 ↓
	analyze_reviews
			 ↓
	compare_countries
```

推荐的典型使用场景：

- “帮我找美国健康健美分类里机会分最高的 habit tracker 相关关键词”
- “分析美国免费榜的热词和分类热度”
- “比较 habit tracker 在 US、JP、DE 的切入机会”
- “根据当前快照生成一个产品路线图”

## Project Structure

```text
src/
	index.ts
	cli.ts
	types.ts
	lib/
		env.ts
		app-store-client.ts
		collector.ts
		query.ts
		scoring.ts
		trends.ts
		insight.ts
		review-analysis.ts
		country-compare.ts
		json-store.ts
		text.ts
	tools/
		common.ts
		search-keywords.ts
		query-keywords.ts
		charts.ts
		reviews.ts
		country-compare.ts
		strategy.ts
data/
	.gitkeep
```

## Notes

- 需求分、竞争分、机会分都是代理指标，不是 Apple 官方搜索量
- 榜单和搜索依赖公开接口，偶发限流或结果波动属于正常现象
- 评论分析基于评论文本和评分分桶，不是完整 NLP 模型
- 多国对比适合做市场优先级判断，不适合作为绝对流量预测

## 提交建议

建议不要提交这些本地或运行期文件：

- `data/keywords.json`
- `.env`
- `dist/`
- `node_modules/`
- 本地 IDE 配置目录