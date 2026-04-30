# src/resume-work/AGENTS.md

## OVERVIEW

resume-work 领域运行时代码目录。这里负责 `/resume-work` 命令在 `command.execute.before` hook 中的近期 session 发现、full context pack 组装与 synthetic text 注入。

`/resume-work` 是 `find_session`（空 query）+ `read_session`（full）的薄层组合，不实现独立的 session 发现/精炼逻辑。`src/commands/resume-work.ts` 仍是 slash command 命令名常量归属地。

## STRUCTURE

```
src/resume-work/
├── context-builder.ts
└── index.ts
```

## COMPONENTS

| 组件                 | 用途                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `context-builder.ts` | 调用 `searchSessions("")` 发现最近 session，调用 `buildSessionContextPack()` 读取 full context pack，渲染注入文本 |
| `index.ts`           | resume-work 域 hook 注册入口，在 `command.execute.before` 中匹配 `/resume-work` 并触发注入                        |

## WHERE TO LOOK

| 目的                              | 位置                                                                             |
| --------------------------------- | -------------------------------------------------------------------------------- |
| 修改 session 发现数量或候选人过滤 | `context-builder.ts` (`getRecentSessions`, `RESUME_WORK_SESSION_COUNT`)          |
| 修改 context pack 组装方式        | `context-builder.ts` (`buildResumeWorkContext`)                                  |
| 修改注入文本渲染格式              | `context-builder.ts` (`renderResumeWorkContext`)                                 |
| 修改 hook 注入时机或条件          | `index.ts`                                                                       |
| 修改 `/resume-work` 命令模板      | `src/commands/resume-work.ts`（命令名常量）、`src/commands/index.ts`（注册模板） |
| 修改 i18n 文案                    | `src/i18n/en.ts`、`src/i18n/zh.ts`                                               |
| 修改 plugin hook 装配             | `src/plugin.ts`                                                                  |
| 修改行为测试                      | `tests/resume-work/*`                                                            |

## CONVENTIONS

- `index.ts` 是 plugin resume-work hook 的领域入口；`plugin.ts` 只调用 `registerResumeWorkHooks(context)` 并组合返回结果。
- `command.execute.before` 中自行匹配 `command.command === RESUME_WORK_COMMAND_NAME`，不匹配时 no-op。
- 目录结构、barrel 出口格式和 plugin.ts 装配边界遵循 `src/AGENTS.md` 中的 `## STRUCTURAL CONVENTIONS`。
- session 发现复用 `searchSessions()`（与 `find_session` 同款搜索入口），空 query 返回按更新时间降序排列的最近 session；不实现独立的发现逻辑。
- context pack 组装复用 `buildSessionContextPack()`（与 `read_session` full 模式同款函数），不使用 preview 或自定义精简格式。
- 注入的 synthetic text 标记 `synthetic: true`，与 `@@ses_...` 引用注入和 search 结果注入保持一致。
- 默认加载 5 个近期 session（`RESUME_WORK_SESSION_COUNT = 5`），排除当前 session 和已归档 session。
- 单个 session 读取失败时静默跳过，在注入块中标注；全部失败时注入提示信息。

## ANTI-PATTERNS

- 不要把 resume-work 的 session 发现逻辑放进 `src/sessions/`（如给 `find_session` 或 `searchSessions` 开"resume-work 专用参数"）。
- 不要把 handoff marker、lineage 或 predecessor resolution 逻辑放进本目录。
- 不要让 `/resume-work` 接受关键词参数——这会破坏纯时间局部性设计。
- 不要用 preview 模式替代 full context pack 作为注入内容。
- 不要在本目录实现独立的 session 精炼/搜索/排序逻辑。
- 不要让 `plugin.ts` 重新内联 session 发现或 context pack 组装逻辑。
