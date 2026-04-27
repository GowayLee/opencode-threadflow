# src/AGENTS.md

## OVERVIEW

运行时代码目录。这里负责 OpenCode 插件入口、slash command 装配、handoff 领域运行时逻辑，以及 session-reference 子系统的显式引用、用户侧搜索、agent 候选发现、`read_session` 分层输出与 session 标题命名。

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
│   ├── chain-parser.ts
│   ├── command-context.ts
│   └── lineage.ts
└── session-reference/
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

| 组件                                     | 用途                                                 | 关键导出                                                                |
| ---------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| `plugin.ts`                              | 创建 `createOpencodeClient`，装配 commands/tool/hook | `ThreadflowPlugin`, `default`                                           |
| `commands/index.ts`                      | 汇总 slash commands                                  | `commands`                                                              |
| `commands/handoff.ts`                    | `handoff` 草稿模板                                   | `HANDOFF_COMMAND_NAME`, `handoffCommand`                                |
| `commands/name-session.ts`               | `/name-session` 标题协议与 tool 调用模板             | `NAME_SESSION_COMMAND_NAME`, `nameSessionCommand`                       |
| `commands/session-search.ts`             | `/search-session` 的结果块协议                       | `SEARCH_SESSION_COMMAND_NAME`, `sessionSearchCommand`                   |
| `handoff/chain-parser.ts`                | handoff source-chain marker 解析与注入文本格式化     | `parseChainMarker`, `extractUpstreamChain`, `buildHandoffInjectionText` |
| `handoff/command-context.ts`             | handoff 命令执行前上下文构造                         | `buildHandoffCommandContextText`                                        |
| `handoff/lineage.ts`                     | handoff-id 生成与 predecessor session resolution     | `generateNextHandoffID`, `resolvePredecessorSessions`                   |
| `session-reference/reference-parser.ts`  | 显式 `@@ses_...` 解析                                | `parseSessionReferences`                                                |
| `session-reference/search/index.ts`      | `/search-session` 与 `find_session` 共享搜索入口     | `searchSessions`, `buildSessionSearchCommandParts`                      |
| `session-reference/search/scoring.ts`    | 搜索 query 解析、IDF 排序与匹配分析                  | `parseSearchQuery`、`computeIdfWeights`、`compareSearchResults`         |
| `session-reference/search/rendering.ts`  | 搜索结果块渲染与 limit 归一化                        | `renderSearchResults`、`normalizeResultLimit`                           |
| `session-reference/injector.ts`          | 注入引用上下文到当前轮                               | `buildSessionReferenceInjectionParts`, `injectSessionReferenceContext`  |
| `session-reference/find-session-tool.ts` | `find_session` 候选搜索工具                          | `FIND_SESSION_TOOL_NAME`, `createFindSessionTool`                       |
| `session-reference/name-session-tool.ts` | `name_session` 当前 session 重命名工具               | `NAME_SESSION_TOOL_NAME`, `createNameSessionTool`                       |
| `session-reference/read-session-tool.ts` | `read_session` 工具                                  | `READ_SESSION_TOOL_NAME`, `createReadSessionTool`                       |
| `session-reference/refinement.ts`        | transcript 精炼与 `full` / `preview` 渲染            | `buildSessionContextPack`, `buildSessionPreviewPack`                    |

## SUBAGENT HIERARCHY

- `./AGENTS.md` - 运行时代码总览
- `./handoff/AGENTS.md` - handoff 领域运行时说明
- `./session-reference/AGENTS.md` - session-reference 子系统说明

在 `src/handoff/` 或 `src/session-reference/` 内工作时，先读最近的子级 `AGENTS.md`。

## WHERE TO LOOK

| 目的                        | 位置                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| 装配插件 hook               | `src/plugin.ts`                                                                           |
| 注册/调整命令               | `src/commands/index.ts`                                                                   |
| 修改 handoff 文案           | `src/commands/handoff.ts`                                                                 |
| 修改 handoff 运行时上下文   | `src/handoff/command-context.ts`、`src/handoff/chain-parser.ts`、`src/handoff/lineage.ts` |
| 修改 `/name-session` 协议   | `src/commands/name-session.ts`、`src/session-reference/name-session-tool.ts`              |
| 修改 `/search-session` 协议 | `src/commands/session-search.ts`、`src/session-reference/search/index.ts`                 |
| 修改 `find_session`         | `src/session-reference/find-session-tool.ts`、`src/session-reference/search/`             |
| 修改显式引用解析            | `src/session-reference/reference-parser.ts`                                               |
| 修改引用注入                | `src/session-reference/injector.ts`                                                       |
| 修改 `read_session`         | `src/session-reference/read-session-tool.ts`                                              |
| 修改 preview/full 渲染      | `src/session-reference/refinement.ts`                                                     |

## CONVENTIONS

- `plugin.ts` 只负责装配与转发，不承载解析/搜索/精炼逻辑。
- `commands/` 只放 slash command 模板与注册，命令层不复制搜索或 transcript 精炼实现。
- `handoff/` 承载 handoff source-chain、handoff-id、predecessor resolution 与 command context 运行时逻辑；命令模板仍留在 `commands/handoff.ts`。
- `command.execute.before` 负责三类注入：为 `handoff` 注入当前 session ID，为 `/name-session` 注入当前 session 元信息，为 `/search-session` 追加 synthetic 结果块。
- `chat.message` 只处理显式 `@@ses_...` 引用，不做隐式召回，并通过 `noReply` prompt 注入加载反馈指令。
- `name_session` 只改当前 session 标题；命令模板负责生成符合 `[动作][对象] 主题` 协议的标题。
- `find_session` 只返回候选 session，不读取 context pack，不自动触发引用注入。
- `read_session` 必须先校验完整 ID，再按 `full` / `preview` 模式读取指定 session。
- 搜索逻辑已拆到 `session-reference/search/`；入口、评分、渲染分文件维护。
- session-reference 输出中的 synthetic 标记和 metadata 是稳定协议，别随意改形状。

## ANTI-PATTERNS

- 不要把 search / injector / refinement 逻辑搬进 command 文件。
- 不要把 handoff marker、lineage 或 predecessor resolution 逻辑放回 `session-reference/`。
- 不要让 command 层直接拼接 transcript 或 context pack。
- 不要把 `/name-session` 的标题协议散落到多个文件各写一份。
- 不要把 `find_session` 和 `read_session` 的职责重新揉成一个工具。
- 不要接受部分 session ID、关键词或 URL 片段作为 `read_session` 输入。
- 不要给 `/search-session` 增加额外解释或 fallback 文案。
- 不要把 synthetic parts 当成普通用户消息处理。
