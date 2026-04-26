## Why

`find_session` 能帮助 agent 找到候选 session，但当前 `read_session` 只能一次性返回完整 context pack，导致 session discovery 阶段在“候选列表”和“完整上下文包”之间缺少中间层。现在多关键词搜索已经完成，需要为读取候选 session 提供更轻量、可判别、仍基于 transcript 证据的预览输出，让 agent 能先确认候选是否相关，再决定是否读取完整内容。

## What Changes

- 为 `read_session` 增加分层输出模式，支持轻量预览和完整 context pack 两个层级。
- 保持 `read_session` 只接受完整 `ses_...` 标识，不承担关键词搜索、候选召回或模糊匹配职责。
- 保持现有完整输出作为默认行为，避免破坏已有 tool 调用、显式 session 引用注入和测试预期。
- 新增 preview 输出，用于 discovery 阶段快速判断候选 session 是否值得进一步读取。
- preview 输出 MUST 基于 transcript 消息内容生成，只保留被选中 turns 的 user / assistant message，不包含工具调用、文件读取、文件编辑等非消息上下文，也不得变成脱离证据的自由总结。
- 更新 `find_session` 的 agent-facing 提示，使 agent 知道可在搜索候选后优先用 `read_session` preview 快速查看具体内容，再按需读取 full。
- 显式 `@@ses_...` 引用注入继续使用完整 context pack，不自动降级为 preview。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `session-reference`: 修改 `read_session` 的读取行为要求，增加分层输出模式，并明确 preview/full 的输入边界、默认行为和与显式引用注入的关系。
- `session-discovery-tool`: 修改 `find_session` 的工具提示要求，说明其与 `read_session` preview/full 的推荐协作方式。

## Impact

- 影响 `src/session-reference/read-session-tool.ts`：需要扩展 tool schema，增加可选读取模式并保持默认兼容。
- 影响 `src/session-reference/refinement.ts`：需要提供 preview 渲染路径或可复用的分层裁剪逻辑。
- 影响 `tests/session-reference/read-session-tool.test.ts`：需要覆盖默认 full 行为、preview 行为、非法 ID 边界和 preview 不替代搜索的约束。
- 影响 `src/session-reference/find-session-tool.ts`：需要更新 tool description 或输出提示，引导 agent 在候选搜索后使用 `read_session` preview。
- 影响 `tests/session-reference/find-session-tool.test.ts`：需要覆盖 `find_session` 提示中包含 preview/full 后续读取方式。
- 可能影响 `src/plugin.ts` 的 tool 注册类型，但不应把 session-reference 逻辑迁回插件入口。
- 不影响 `find_session` 和 `/session-search` 的候选搜索语义。
- 不引入新的运行时依赖。
