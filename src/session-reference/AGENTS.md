# src/session-reference/AGENTS.md

## OVERVIEW

显式 session 引用子系统。这里负责 `@@ses_...` 解析、用户侧 session 搜索、agent 侧候选发现、引用注入、`read_session` 的 `full` / `preview` 输出，以及 transcript 精炼。

## STRUCTURE

```
src/session-reference/
├── reference-parser.ts
├── search.ts
├── injector.ts
├── find-session-tool.ts
├── read-session-tool.ts
└── refinement.ts
```

## COMPONENTS

| 组件                   | 用途                                                                     |
| ---------------------- | ------------------------------------------------------------------------ |
| `reference-parser.ts`  | 解析显式 `@@ses_...` 引用并去重                                          |
| `search.ts`            | `/session-search` 与 `find_session` 共用的搜索、分桶、排序与结果渲染核心 |
| `injector.ts`          | 把引用变成 synthetic 注入块并写回当前轮，并追加加载反馈 prompt           |
| `find-session-tool.ts` | `find_session` 工具定义与候选 Markdown 输出                              |
| `read-session-tool.ts` | `read_session` 工具定义、完整 ID 校验、模式分发                          |
| `refinement.ts`        | transcript 归一化、turn 组装、压缩、`full` / `preview` 渲染              |

## WHERE TO LOOK

| 目的                          | 位置                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| 改引用语法                    | `reference-parser.ts`、`injector.ts`、`read-session-tool.ts`                                 |
| 改 `/session-search` 结果格式 | `search.ts`、`tests/session-reference/search.test.ts`                                        |
| 改 `find_session` 输出        | `find-session-tool.ts`、`tests/session-reference/find-session-tool.test.ts`                  |
| 改引用注入行为                | `injector.ts`、`tests/session-reference/injector.test.ts`                                    |
| 改 `read_session` 输出        | `read-session-tool.ts`、`refinement.ts`、`tests/session-reference/read-session-tool.test.ts` |
| 改 context pack 结构          | `refinement.ts`、`tests/session-reference/refinement.test.ts`                                |

## CONVENTIONS

- `parseSessionReferences()` 只认非 synthetic text 里的显式 `@@ses_...`。
- `searchSessions()` 先看 title，再看 slug / id，最后才按有限 transcript sample 兜底；`/session-search` 和 `find_session` 共用这套语义，并支持空格分隔多关键词排序。
- `injectSessionReferenceContext()` 输出的 synthetic text 必须带稳定 metadata；有引用时还要追加面向模型的加载反馈 prompt。
- `find_session` 只做候选发现；`read_session` 只接受完整 session id，不承担搜索职责。
- `buildSessionContextPack()` 输出应偏可读压缩 transcript，而不是自由摘要。
- `buildSessionPreviewPack()` 只保留首尾窗口里的 user / assistant 正文，不带 Activity、工具调用或文件活动明细。
- 显式 `@@ses_...` 引用注入继续使用完整 context pack，不因为 preview 存在而自动降级。

## ANTI-PATTERNS

- 不要把模糊搜索塞进 `read_session`。
- 不要让 `find_session` 自动补调 `read_session` 或自动注入候选 session 上下文。
- 不要把 synthetic 注入当普通内容吞掉。
- 不要让显式引用偷偷走 `preview` 输出。
- 不要让 context pack 退化成字段 dump。
- 不要让缺失 session 静默变成伪造上下文。
