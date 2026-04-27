# src/handoff/AGENTS.md

## OVERVIEW

handoff 领域运行时代码目录。这里负责 handoff source-chain marker 解析、handoff command synthetic context 构造、handoff-id 生成、predecessor session resolution，以及这些能力需要的稳定格式化逻辑。

`src/commands/handoff.ts` 仍是 slash command 模板与命令元信息归属地；本目录不复制 command template 或 command registration。

## STRUCTURE

```
src/handoff/
├── chain-parser.ts
├── command-context.ts
└── lineage.ts
```

## COMPONENTS

| 组件                 | 用途                                                            |
| -------------------- | --------------------------------------------------------------- |
| `chain-parser.ts`    | 解析 `[handoff-source-chain]:`，格式化任务流和 handoff 注入文本 |
| `command-context.ts` | 为 `handoff` command 执行前构造 synthetic context 文本          |
| `lineage.ts`         | 解析/生成 `[handoff-id]:`，反查 predecessor child sessions      |

## WHERE TO LOOK

| 目的                                | 位置                      |
| ----------------------------------- | ------------------------- |
| 修改 source-chain marker 解析       | `chain-parser.ts`         |
| 修改 handoff command 注入上下文     | `command-context.ts`      |
| 修改 handoff-id 或 predecessor 查找 | `lineage.ts`              |
| 修改 handoff prompt 模板            | `src/commands/handoff.ts` |
| 修改 plugin hook 装配               | `src/plugin.ts`           |
| 修改 handoff 行为测试               | `tests/handoff/*`         |

## CONVENTIONS

- `command-context.ts` 是 plugin handoff hook 的领域入口；`plugin.ts` 只调用它并附加 synthetic part。
- `[handoff-source-chain]:` 只表达线性任务流，不承载 handoff-id、predecessor sessions 或 DAG 分叉信息。
- `[handoff-id]: hdf<current-session-id 中 ses_ 之后的 ID 串>-n` 标识当前 session 中的一次 handoff note，不是 child session ID。
- predecessor sessions 只作为 `read_session` lookup pointer，不作为事实摘要。
- 子会话反查只匹配候选 session 的首个非 synthetic user message 中完整 `[handoff-id]: ...` marker。
- runtime synthetic context 只输出真实运行时数据，不注入 fake concrete session ID 示例。
- 命令模板中的格式示例应使用占位符，避免 `ses_AAA` 等示例 ID 污染运行时判断。

## ANTI-PATTERNS

- 不要把 handoff marker、lineage 或 predecessor resolution 逻辑放回 `src/session-reference/`。
- 不要让 `plugin.ts` 重新内联 transcript 扫描、handoff-id sequence 计算或 predecessor session scan。
- 不要把 `src/commands/handoff.ts` 的 prompt 模板复制到本目录。
- 不要为 unresolved 或 ambiguous handoff-id 编造 child session ID。
- 不要把 predecessor session 内容合并进 `[handoff-source-chain]:`。
