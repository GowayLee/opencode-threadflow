## ADDED Requirements

### Requirement: `find_session` 必须提示 agent 使用 `read_session` preview 查看候选内容

系统 MUST 在 `find_session` 的 agent-facing 工具提示或结果提示中说明推荐协作方式：`find_session` 只返回候选 session ID；agent 可以使用返回的完整 session ID 调用 `read_session` 的 `preview` 模式，在短上下文中快速查看候选 session 的具体消息内容；如果 preview 显示候选相关，agent 可以再使用 `full` 模式读取完整上下文包。该提示不得暗示 `find_session` 会自动读取候选 session，也不得限制 agent 只能在 `find_session` 之后调用 `read_session` preview。

#### Scenario: tool 提示说明 preview 后续读取方式

- **WHEN** agent 查看或使用 `find_session` tool
- **THEN** tool 的 agent-facing 提示说明可用返回的完整 session ID 调用 `read_session` preview 快速查看候选 session 的具体内容

#### Scenario: 搜索结果提示 preview 和 full 的分层用途

- **WHEN** `find_session` 返回一个或多个候选 session
- **THEN** 输出中显式提示 agent 可先用 `read_session` preview 查看删减消息预览，再按需用 `read_session` full 获取完整上下文包

#### Scenario: 提示不改变工具职责边界

- **WHEN** `find_session` 提示 agent 可结合 `read_session` preview 使用
- **THEN** 系统仍不会自动对候选调用 `read_session`，也不会在 `find_session` 输出中包含 preview 或 full context pack

#### Scenario: 提示不限制 preview 的直接调用

- **WHEN** agent 已经掌握完整 session ID 且需要快速查看该 session 内容
- **THEN** 系统允许 agent 直接调用 `read_session` preview，而不要求必须先调用 `find_session`
