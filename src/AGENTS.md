# src/AGENTS.md

## OVERVIEW

运行时代码目录。这里负责 OpenCode 插件入口、slash command 装配，以及 session-reference 子系统的显式引用、用户侧搜索、agent 候选发现、`read_session` 分层输出和 handoff source session 注入。

## STRUCTURE

```
src/
├── plugin.ts
├── commands/
│   ├── index.ts
│   ├── handoff.ts
│   └── session-search.ts
└── session-reference/
    ├── reference-parser.ts
    ├── search.ts
    ├── injector.ts
    ├── find-session-tool.ts
    ├── read-session-tool.ts
    └── refinement.ts
```

## COMPONENTS

| 组件                                     | 用途                                                 | 关键导出                                                               |
| ---------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| `plugin.ts`                              | 创建 `createOpencodeClient`，装配 commands/tool/hook | `ThreadflowPlugin`, `default`                                          |
| `commands/index.ts`                      | 汇总 slash commands                                  | `commands`                                                             |
| `commands/handoff.ts`                    | `handoff` 草稿模板                                   | `HANDOFF_COMMAND_NAME`, `handoffCommand`                               |
| `commands/session-search.ts`             | `session-search` 的结果块协议                        | `SESSION_SEARCH_COMMAND_NAME`, `sessionSearchCommand`                  |
| `session-reference/reference-parser.ts`  | 显式 `@@ses_...` 解析                                | `parseSessionReferences`                                               |
| `session-reference/search.ts`            | `/session-search` 与 `find_session` 共享搜索核心     | `searchSessions`, `buildSessionSearchCommandParts`                     |
| `session-reference/injector.ts`          | 注入引用上下文到当前轮                               | `buildSessionReferenceInjectionParts`, `injectSessionReferenceContext` |
| `session-reference/find-session-tool.ts` | `find_session` 候选搜索工具                          | `FIND_SESSION_TOOL_NAME`, `createFindSessionTool`                      |
| `session-reference/read-session-tool.ts` | `read_session` 工具                                  | `READ_SESSION_TOOL_NAME`, `createReadSessionTool`                      |
| `session-reference/refinement.ts`        | transcript 精炼与 `full` / `preview` 渲染            | `buildSessionContextPack`, `buildSessionPreviewPack`                   |

## SUBAGENT HIERARCHY

- `./AGENTS.md` - 运行时代码总览
- `./session-reference/AGENTS.md` - session-reference 子系统说明

在 `src/session-reference/` 内工作时，先读最近的子级 `AGENTS.md`。

## WHERE TO LOOK

| 目的                     | 位置                                                                            |
| ------------------------ | ------------------------------------------------------------------------------- |
| 装配插件 hook            | `src/plugin.ts`                                                                 |
| 注册/调整命令            | `src/commands/index.ts`                                                         |
| 修改 handoff 文案        | `src/commands/handoff.ts`、`src/plugin.ts`                                      |
| 修改 session-search 协议 | `src/commands/session-search.ts`、`src/session-reference/search.ts`             |
| 修改 `find_session`      | `src/session-reference/find-session-tool.ts`、`src/session-reference/search.ts` |
| 修改显式引用解析         | `src/session-reference/reference-parser.ts`                                     |
| 修改引用注入             | `src/session-reference/injector.ts`                                             |
| 修改 `read_session`      | `src/session-reference/read-session-tool.ts`                                    |
| 修改 preview/full 渲染   | `src/session-reference/refinement.ts`                                           |

## CONVENTIONS

- `plugin.ts` 只负责装配与转发，不承载解析/搜索/精炼逻辑。
- `commands/` 只放 slash command 模板与注册，命令层不复制搜索或 transcript 精炼实现。
- `command.execute.before` 负责两类注入：为 `handoff` 注入当前 session ID，为 `/session-search` 追加 synthetic 结果块。
- `chat.message` 只处理显式 `@@ses_...` 引用，不做隐式召回，并通过 `noReply` prompt 注入加载反馈指令。
- `find_session` 只返回候选 session，不读取 context pack，不自动触发引用注入。
- `read_session` 必须先校验完整 ID，再按 `full` / `preview` 模式读取指定 session。
- session-reference 输出中的 synthetic 标记和 metadata 是稳定协议，别随意改形状。

## ANTI-PATTERNS

- 不要把 search / injector / refinement 逻辑搬进 command 文件。
- 不要让 command 层直接拼接 transcript 或 context pack。
- 不要把 `find_session` 和 `read_session` 的职责重新揉成一个工具。
- 不要接受部分 session ID、关键词或 URL 片段作为 `read_session` 输入。
- 不要给 `/session-search` 增加额外解释或 fallback 文案。
- 不要把 synthetic parts 当成普通用户消息处理。
