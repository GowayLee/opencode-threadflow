# src/AGENTS.md

## OVERVIEW

运行时代码目录。这里负责 OpenCode 插件入口、slash command 装配、handoff 领域运行时逻辑，以及 sessions 子系统的显式引用、用户侧搜索、agent 候选发现、`read_session` 分层输出与 session 标题命名。

## STRUCTURE

```
src/
├── plugin.ts
├── commands/
│   ├── index.ts
│   ├── handoff.ts
│   ├── name-session.ts
│   └── session-search.ts
├── handoff/
│   ├── index.ts
│   ├── chain-parser.ts
│   ├── command-context.ts
│   └── lineage.ts
└── sessions/
    ├── index.ts
    ├── hook-context.ts
    ├── reference-parser.ts
    ├── search/
    │   ├── index.ts
    │   ├── scoring.ts
    │   └── rendering.ts
    ├── injector.ts
    ├── find-session-tool.ts
    ├── name-session-tool.ts
    ├── read-session-tool.ts
    └── refinement.ts
```

## COMPONENTS

| 组件                            | 用途                                                 | 关键导出                                                                |
| ------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| `plugin.ts`                     | 创建 `createOpencodeClient`，装配 commands/tool/hook | `ThreadflowPlugin`, `default`                                           |
| `commands/index.ts`             | 汇总 slash commands                                  | `commands`                                                              |
| `commands/handoff.ts`           | `handoff` 草稿模板                                   | `HANDOFF_COMMAND_NAME`, `handoffCommand`                                |
| `commands/name-session.ts`      | `/name-session` 标题协议与 tool 调用模板             | `NAME_SESSION_COMMAND_NAME`, `nameSessionCommand`                       |
| `commands/session-search.ts`    | `/search-session` 的结果块协议                       | `SEARCH_SESSION_COMMAND_NAME`, `sessionSearchCommand`                   |
| `handoff/index.ts`              | handoff 域 hook 注册入口                             | `registerHandoffHooks`                                                  |
| `handoff/chain-parser.ts`       | handoff source-chain marker 解析与注入文本格式化     | `parseChainMarker`, `extractUpstreamChain`, `buildHandoffInjectionText` |
| `handoff/command-context.ts`    | handoff 命令执行前上下文构造                         | `buildHandoffCommandContextText`                                        |
| `handoff/lineage.ts`            | handoff-id 生成与 predecessor session resolution     | `generateNextHandoffID`, `resolvePredecessorSessions`                   |
| `sessions/index.ts`             | sessions 域 tool 与 hook 注册入口                    | `registerSessionTools`, `registerSessionHooks`                          |
| `sessions/hook-context.ts`      | `/name-session` 命令执行前上下文构造                 | `buildNameSessionHookContext`                                           |
| `sessions/reference-parser.ts`  | 显式 `@@ses_...` 解析                                | `parseSessionReferences`                                                |
| `sessions/search/index.ts`      | `/search-session` 与 `find_session` 共享搜索入口     | `searchSessions`, `buildSessionSearchCommandParts`                      |
| `sessions/search/scoring.ts`    | 搜索 query 解析、IDF 排序与匹配分析                  | `parseSearchQuery`、`computeIdfWeights`、`compareSearchResults`         |
| `sessions/search/rendering.ts`  | 搜索结果块渲染与 limit 归一化                        | `renderSearchResults`、`normalizeResultLimit`                           |
| `sessions/injector.ts`          | 注入引用上下文到当前轮                               | `buildSessionReferenceInjectionParts`, `injectSessionReferenceContext`  |
| `sessions/find-session-tool.ts` | `find_session` 候选搜索工具                          | `FIND_SESSION_TOOL_NAME`, `createFindSessionTool`                       |
| `sessions/name-session-tool.ts` | `name_session` 当前 session 重命名工具               | `NAME_SESSION_TOOL_NAME`, `createNameSessionTool`                       |
| `sessions/read-session-tool.ts` | `read_session` 工具                                  | `READ_SESSION_TOOL_NAME`, `createReadSessionTool`                       |
| `sessions/refinement.ts`        | transcript 精炼与 `full` / `preview` 渲染            | `buildSessionContextPack`, `buildSessionPreviewPack`                    |

## SUBAGENT HIERARCHY

- `./AGENTS.md` - 运行时代码总览
- `./handoff/AGENTS.md` - handoff 领域运行时说明
- `./sessions/AGENTS.md` - sessions 子系统说明

在 `src/handoff/` 或 `src/sessions/` 内工作时，先读最近的子级 `AGENTS.md`。

## WHERE TO LOOK

| 目的                        | 位置                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| 装配插件 hook               | `src/plugin.ts`                                                                                     |
| 注册/调整命令               | `src/commands/index.ts`                                                                             |
| 修改 handoff 文案           | `src/commands/handoff.ts`                                                                           |
| 修改 handoff 运行时上下文   | `src/handoff/command-context.ts`、`src/handoff/chain-parser.ts`、`src/handoff/lineage.ts`           |
| 修改 `/name-session` 协议   | `src/commands/name-session.ts`、`src/sessions/name-session-tool.ts`、`src/sessions/hook-context.ts` |
| 修改 `/search-session` 协议 | `src/commands/session-search.ts`、`src/sessions/search/index.ts`                                    |
| 修改 `find_session`         | `src/sessions/find-session-tool.ts`、`src/sessions/search/`                                         |
| 修改显式引用解析            | `src/sessions/reference-parser.ts`                                                                  |
| 修改引用注入                | `src/sessions/injector.ts`                                                                          |
| 修改 `read_session`         | `src/sessions/read-session-tool.ts`                                                                 |
| 修改 preview/full 渲染      | `src/sessions/refinement.ts`                                                                        |

## CONVENTIONS

- `plugin.ts` 只负责装配与转发，不承载解析/搜索/精炼逻辑。
- `commands/` 只放 slash command 模板与注册，命令层不复制搜索或 transcript 精炼实现。
- `handoff/` 承载 handoff source-chain、handoff-id、predecessor resolution 与 command context 运行时逻辑；命令模板仍留在 `commands/handoff.ts`。
- `command.execute.before` 负责三类注入：为 `handoff` 注入当前 session ID，为 `/name-session` 注入当前 session 元信息，为 `/search-session` 追加 synthetic 结果块。
- `chat.message` 只处理显式 `@@ses_...` 引用，不做隐式召回，并通过 `noReply` prompt 注入加载反馈指令。
- `name_session` 只改当前 session 标题；命令模板负责生成符合 `[动作][对象] 主题` 协议的标题。
- `find_session` 只返回候选 session，不读取 context pack，不自动触发引用注入。
- `read_session` 必须先校验完整 ID，再按 `full` / `preview` 模式读取指定 session。
- 搜索逻辑已拆到 `sessions/search/`；入口、评分、渲染分文件维护。
- sessions 输出中的 synthetic 标记和 metadata 是稳定协议，别随意改形状。

## STRUCTURAL CONVENTIONS

以下规约来自 `refactor-plugin-architecture` 重构的决策沉淀，为后续新增目录/领域模块提供约束。

### 目录命名

- 域目录使用**单字领域概念名**，无连字符，与 `commands/` 复数形式一致。
- 正面例：`handoff/`、`sessions/`、`commands/`
- 反面例：`session-reference/`（技术描述名，且语义与实际职责不匹配）

### Barrel export 模式

- 每个域目录 MUST 拥有 `index.ts` barrel，对外暴露 `registerXxxHooks(ctx)` 和/或 `registerXxxTools(ctx)` 工厂函数。
- 工厂函数接受 `{ client, directory }` 上下文，返回插件片段（tool 注册对象、hook 函数等）。
- `plugin.ts` 只调用这些工厂并组合返回结果，不关心域内部的 tool 名称、hook 分发逻辑、command name 匹配。
- 示例签名：
  - `registerXxxHooks(ctx) → { "command.execute.before": HookFn, "chat.message": HookFn }`
  - `registerXxxTools(ctx) → { tool: {...}, enabled: {...} }`

### plugin.ts 装配层约束

- `plugin.ts` MUST 只做三件事：创建 client、调用域工厂、组合返回的插件片段。
- `plugin.ts` MUST NOT：
  - 内联任何领域逻辑（context 构造、文本拼接、Part 组装）
  - 识别具体 command name（匹配逻辑留在域 hook 内部）
  - 出现 `as unknown as Part`（类型绕过只允许在域内部）
- plugin.ts 的 import 只来自 `./commands`、`./handoff`、`./sessions` 等顶层 barrel。

### Hook 组合约定

- 当多个域都提供同一 hook key（如 `"command.execute.before"`）时，plugin.ts 负责**顺序调用**各域的 hook 函数，而不是用 object spread 互相覆盖。
- 每个域的 hook 函数内部自行判断 `command.command === XXX_NAME`，不匹配时 no-op。

### Tool 注册聚合

- 域的 `registerXxxTools` 同时返回 `tool` 对象和 `enabled` 对象，使 plugin.ts 能一行完成 tool 注册与启用：
  ```ts
  const sessionTools = registerSessionTools(ctx);
  return {
    tool: sessionTools.tool,
    config: async (config) => {
      config.tools = { ...config.tools, ...sessionTools.enabled };
    },
  };
  ```
- 新增 tool 只需在域内部修改 `registerXxxTools`，不再需要改 plugin.ts 的多处位置。

### 新增域目录的参考流程

1. 在 `src/` 下创建单字领域目录（如 `src/audit/`）
2. 在目录内创建 `index.ts` barrel，导出 `registerAuditHooks(ctx)` / `registerAuditTools(ctx)`
3. 在 `plugin.ts` 中增加一行 `import { registerAuditHooks } from "./audit"`，调用工厂并组合返回片段
4. 更新 `src/AGENTS.md` 的 STRUCTURE、COMPONENTS、WHERE TO LOOK 和 SUBAGENT HIERARCHY
5. 新增 `src/audit/AGENTS.md` 说明该域职责边界
6. 更新根 `AGENTS.md` 的 CODE MAP
7. `tests/` 下新建对应测试目录

## ANTI-PATTERNS

- 不要把 search / injector / refinement 逻辑搬进 command 文件。
- 不要把 handoff marker、lineage 或 predecessor resolution 逻辑放回 `sessions/`。
- 不要让 command 层直接拼接 transcript 或 context pack。
- 不要把 `/name-session` 的标题协议散落到多个文件各写一份。
- 不要把 `find_session` 和 `read_session` 的职责重新揉成一个工具。
- 不要接受部分 session ID、关键词或 URL 片段作为 `read_session` 输入。
- 不要给 `/search-session` 增加额外解释或 fallback 文案。
- 不要把 synthetic parts 当成普通用户消息处理。
