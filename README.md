# App Store Keyword Opportunity

一个基于 TypeScript 的 App Store 关键词机会分析工具，既可以作为交互式 CLI 使用，也可以作为 MCP Server 接入 Claude Desktop、Cursor 等支持 MCP 的客户端。

它的目标不是给出 Apple 官方搜索量，而是用公开可获取的数据做一套可操作的代理分析：

- 关键词机会挖掘：需求分、竞争分、机会分
- 榜单热度分析：热词、分类热度、变现格局
- 竞品评论分析：差评痛点、好评卖点
- 多国市场对比：找到更适合切入的地区
- 产品策略报告：把关键词结果转成研发方向和产品路线图

## 使用方式

### CLI

适合手动探索和本地分析。

支持的命令：

- `menu`：交互式主菜单
- `collect`：采集关键词快照
- `query`：筛选关键词
- `trend`：实时榜单热度分析
- `compare`：快照对比
- `strategy`：产品策略报告
- `review`：竞品评论情感分析
- `country-compare`：多国市场对比

### MCP Server

适合把整个项目作为工具服务接入 AI 客户端，通过对话直接调用能力。

当前暴露的 MCP 工具：

- `search_keywords`：采集关键词机会数据
- `query_keywords`：查询本地快照文件
- `fetch_chart`：拉取 iTunes 榜单
- `analyze_chart`：分析榜单热词和分类热度
- `analyze_reviews`：分析竞品评论痛点和卖点
- `compare_countries`：多国市场横向对比
- `build_strategy`：生成产品策略报告

## 快速开始

安装依赖并编译：

```bash
npm install
npm run build
```

启动交互式菜单：

```bash
npm run menu
```

推荐首次使用流程：

1. `采集关键词数据`
2. `查询与筛选结果`
3. `产品策略报告`
4. `竞品评论情感分析`

## 常用命令

```bash
npm run build
npm run typecheck

npm run menu
npm run collect
npm run query
npm run trend
npm run compare
npm run strategy
npm run review
npm run country-compare

npm run mcp
```

说明：

- `npm run build`：将 TypeScript 编译到 `dist/`
- `npm run typecheck`：只做类型检查，不生成产物
- `npm run mcp`：运行 MCP Server
- `npm start`：会先编译，再启动 MCP Server

## MCP 接入

先构建：

```bash
npm run build
```

然后在 MCP 客户端中配置：

```json
{
	"mcpServers": {
		"app-store-keyword": {
			"command": "node",
			"args": ["/absolute/path/to/app-store-keyword-opportunity/dist/mcp.js"]
		}
	}
}
```

Windows 示例：

```json
{
	"mcpServers": {
		"app-store-keyword": {
			"command": "node",
			"args": ["C:/path/to/app-store-keyword-opportunity/dist/mcp.js"]
		}
	}
}
```

几个典型的 MCP 使用场景：

- “帮我找美国健康健美分类里机会分最高的 habit tracker 相关关键词”
- “分析美国免费榜的热词和分类热度”
- “比较 habit tracker 在 US、JP、DE 的切入机会”
- “根据当前快照给出一个产品路线图”

## 环境变量

可选配置见 `.env.example`：

```bash
DATA_FILE=./data/keywords.json
```

说明：

- `DATA_FILE` 是本地快照默认输出路径
- `data/keywords.json` 是运行产物，已加入 `.gitignore`

## 项目结构

```text
src/
	cli.ts
	mcp.ts
	types.ts
	lib/
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
data/
	.gitkeep
```

## 设计说明

- 需求分、竞争分、机会分都是代理指标，不是 Apple 官方搜索量
- 榜单和搜索依赖公开接口，偶发限流或波动属于正常现象
- 评论分析目前基于高频词和评分分桶，不是完整 NLP 情感模型
- 多国对比适合做市场优先级判断，不适合作为绝对流量预测

## 提交建议

建议不要提交这些本地或运行期文件：

- `data/keywords.json`
- `.env`
- `dist/`
- `node_modules/`
- 本地 IDE 配置目录