# app-store-keyword-opportunity

一个从零重建的 App 选题发现工作流，核心目标不是复用旧的关键词工具，而是把三条发现路径统一到同一个评分和输出模型里：

- 趋势发现：找正在形成的新机会
- 关键词发现：找显性需求里的细分缺口
- 替代发现：找“产品老了但用户还在”的存量替代机会

当前实现提供一个 MCP tool 和一个 CLI 入口，用同一套引擎输出候选机会、分项证据、优先级分层和标准化 brief。

仓库已经整理成适合 npm 发布的形态：

- 可执行入口通过 `bin` 暴露 MCP server 和 CLI
- 模块入口通过包根导出 `runWorkflow`、adapter 和类型定义
- npm 发布内容只包含运行时构建产物与 README，不包含测试文件和 sourcemap

## MCP Tool

服务启动后会暴露一个工具：

| Tool | Description |
| --- | --- |
| `discover_app_topics` | 按 `trend`、`keyword` 或 `replacement` 三种模式执行发现、评分和 brief 生成 |

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
- `npm pack --dry-run` 应只包含运行时构建文件和 README

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
	tests/
		workflow.test.ts
openspec/
	changes/
		create-ai-app-topic-discovery-workflow/
```

## Notes

- 当前实现是规则驱动和样例驱动的工作流骨架，不依赖旧项目里的关键词采集实现
- 分数代表结构化判断，不代表真实市场规模预测
- `supplyFreshness` 是供给证据，不是机会正向维度；最终排序会将其反向解释为 stale-supply opportunity
- 缺失证据不会阻止出结果，但会降低 `confidence` 并显式标记缺口