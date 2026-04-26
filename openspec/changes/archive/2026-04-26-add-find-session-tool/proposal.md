## Why

当前 `/session-search` 已能帮助用户手动定位历史 session，但 agent 仍无法在需要时主动检索候选 session，只能依赖用户先执行 slash command 并复制结果。既然 `read_session` 已作为 agent tool 提供完整 session 读取能力，现在需要补齐与之配套的 agent 可调用搜索入口，让 agent 能先查找候选，再按需读取明确的 session。

## What Changes

- 新增 `find_session` agent tool，用于按关键词搜索最近的非归档 session，并返回可供后续 `read_session` 使用的完整 session ID。
- 复用现有 `searchSessions()` 的搜索语义，保持与 `/session-search` 一致的搜索窗口、匹配分桶和排序；`find_session` 不做分页，返回当前搜索窗口内的全部匹配结果。
- 明确 `find_session` 只负责候选查找，不读取完整 transcript、不生成 context pack，也不自动注入历史 session 上下文。
- 保留 `/session-search` 作为用户侧显式搜索流程；新增 tool 不替代 slash command，也不改变 `@@<session-id>` 的插件层引用语义。
- 在插件工具注册与配置中启用 `find_session`，使 agent 可通过结构化参数调用该搜索能力。

## Capabilities

### New Capabilities

- `session-discovery-tool`: 定义 agent 可调用的 session 搜索工具能力，包括输入边界、候选结果格式，以及与 `read_session` 和 `/session-search` 的职责分层。

### Modified Capabilities

- `session-reference`: 扩展现有 session 引用能力边界，允许 agent 通过 `find_session` 搜索候选 session，但仍保持显式引用注入、`read_session` 完整 ID 读取、以及 `/session-search` 用户搜索流程的既有约束。

## Impact

- `src/session-reference/search.ts` — 复用已有搜索引擎，必要时导出稳定的 tool 渲染或结构化结果辅助函数。
- `src/session-reference/find-session-tool.ts` — 新增 `find_session` tool 定义。
- `src/plugin.ts` — 注册并启用 `find_session`，与 `read_session` 并列暴露给 agent。
- `tests/session-reference/` — 新增 tool 行为测试，并覆盖空查询、无结果、命中结果、全量输出和职责边界。
- `openspec/specs/session-reference/spec.md` — 更新 agent 搜索工具与显式引用流程之间的行为边界。
- `openspec/specs/session-discovery-tool/spec.md` — 新增 capability 规范。
