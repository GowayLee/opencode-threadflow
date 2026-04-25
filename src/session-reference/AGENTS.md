# src/session-reference/AGENTS.md

## OVERVIEW

显式 session 引用子系统。这里负责 `@@ses_...` 解析、session 搜索、引用注入、`read_session` 工具和 transcript 精炼。

## STRUCTURE

```
src/session-reference/
├── reference-parser.ts
├── search.ts
├── injector.ts
├── read-session-tool.ts
└── refinement.ts
```

## COMPONENTS

| 组件                   | 用途                                                  |
| ---------------------- | ----------------------------------------------------- |
| `reference-parser.ts`  | 解析显式 `@@ses_...` 引用并去重                       |
| `search.ts`            | 近因 session 搜索、命中分桶、结果块渲染               |
| `injector.ts`          | 把引用变成 synthetic 注入块并写回当前轮               |
| `read-session-tool.ts` | `read_session` 工具定义和完整 ID 校验                 |
| `refinement.ts`        | transcript 归一化、turn 组装、压缩、context pack 渲染 |

## WHERE TO LOOK

| 目的                   | 位置                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| 改引用语法             | `reference-parser.ts`、`injector.ts`、`read-session-tool.ts`                                 |
| 改搜索结果格式         | `search.ts`、`tests/session-reference/search.test.ts`                                        |
| 改引用注入行为         | `injector.ts`、`tests/session-reference/injector.test.ts`                                    |
| 改 `read_session` 输出 | `read-session-tool.ts`、`refinement.ts`、`tests/session-reference/read-session-tool.test.ts` |
| 改 context pack 结构   | `refinement.ts`、`tests/session-reference/refinement.test.ts`                                |

## CONVENTIONS

- `parseSessionReferences()` 只认非 synthetic text 里的显式 `@@ses_...`。
- `searchSessions()` 先看 title / slug / id，再按 transcript sample 兜底。
- `injectSessionReferenceContext()` 输出的 synthetic text 必须带稳定 metadata。
- `read_session` 只接受完整 session id，不承担搜索职责。
- `buildSessionContextPack()` 输出应偏可读压缩 transcript，而不是自由摘要。

## ANTI-PATTERNS

- 不要把模糊搜索塞进 `read_session`。
- 不要把 synthetic 注入当普通内容吞掉。
- 不要让 context pack 退化成字段 dump。
- 不要让缺失 session 静默变成伪造上下文。
