## Why

随着 OpenCode 使用时间增长，session 数量快速膨胀，但模型自动生成的 session 标题往往过于泛泛、不稳定、缺乏检索价值——直接削弱 `find_session` 的召回效果，使历史 session 变成"有内容但找不到"的死数据。`name_session` 通过引入结构化标题协议，将 session 标题从随手生成的摘要提升为面向人类阅读和 agent 检索的轻量索引。

## What Changes

- 新增 **slash command**（如 `/name-session`）：向 agent 注入命名指导（标题协议、动作标签集合、对象选取原则、主题规范），让 agent 基于当前 session 内容生成符合协议的标题
- 新增 **agent tool** `name_session`：调用 OpenCode SDK `client.session.update()` 执行实际重命名操作，支持重命名当前 session 或指定 session ID
- 建立 **标题协议** `[动作][对象] 主题`：定义 10 个动作标签（调研/探索/讨论/设计/决策/实现/调试/验证/审查/交接）、对象选取规则（高检索价值的关键词）和主题约束（8-18 字、表达最终有效产物）
- `name_session` 工具在重命名成功后返回新旧标题对比，让 agent 可向用户报告变更

## Capabilities

### New Capabilities

- `session-naming`: session 结构化命名能力。涵盖 slash command 的命名指导注入、agent tool 的 SDK 重命名调用、`[动作][对象] 主题` 标题协议的定义与约束

### Modified Capabilities

<!-- 本次变更不修改现有 spec 的 REQUIREMENT。find_session 标题加权匹配属于后续优化方向，不在本变更范围内。 -->

（无）

## Impact

- `src/commands/name-session.ts` — 新增 slash command 模板（命名指导注入）
- `src/commands/index.ts` — 注册新命令
- `src/session-reference/name-session-tool.ts` — 新增 agent tool 实现（调用 `client.session.update`，参数：`sessionID`、`title`）
- `src/plugin.ts` — 装配新工具和新命令到 `tool` 字典、`config.tools`、`config.command` 及可能的 `command.execute.before` hook
- 依赖 `@opencode-ai/sdk/v2` 已有的 `client.session.update()` API（已调研确认可用）
- 测试：`tests/session-reference/name-session/*` 覆盖标题协议校验、重命名成功/失败路径
