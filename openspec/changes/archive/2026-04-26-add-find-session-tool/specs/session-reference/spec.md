## ADDED Requirements

### Requirement: Agent 搜索工具不得改变显式 session 引用边界

系统 MUST 允许 agent 通过 `find_session` 查找候选 session，但该搜索动作不得改变 `@@<session-id>` 显式引用、插件层引用处理、以及当前轮上下文附加的既有边界。

#### Scenario: Agent 搜索不触发显式引用注入

- **WHEN** agent 调用 `find_session` 并获得候选 session
- **THEN** 系统不会将这些候选视为用户提交的 `@@<session-id>` 显式引用，也不会自动附加对应 session 上下文

#### Scenario: 用户显式引用仍由插件层处理

- **WHEN** 用户消息中包含 `@@<session-id>`
- **THEN** 系统仍由插件层解析并处理该显式引用，而不是要求 agent 先调用或补调 `find_session`

#### Scenario: Agent 搜索不替代用户侧搜索命令

- **WHEN** 用户准备手动定位可引用 session
- **THEN** 用户仍可使用 `/session-search <关键词>` 完成候选查找，而不要求通过 agent 调用 `find_session`

### Requirement: `find_session` 与 `read_session` 必须保持职责分离

系统 MUST 保持 `find_session` 和 `read_session` 的工具职责分离：`find_session` 负责关键词候选搜索，`read_session` 负责基于完整 session ID 返回引用上下文包。

#### Scenario: 关键词搜索使用 `find_session`

- **WHEN** agent 只有关键词、标题线索或不完整 session 线索
- **THEN** agent 可调用 `find_session` 获取候选 session ID

#### Scenario: 完整上下文读取使用 `read_session`

- **WHEN** agent 已经确定完整 session ID 并需要读取其上下文
- **THEN** agent 使用 `read_session` 读取该指定 session 的 context pack

#### Scenario: `read_session` 不承担候选搜索职责

- **WHEN** agent 向 `read_session` 提供关键词、截断 ID 或其他非完整 session 标识
- **THEN** `read_session` 仍不会将该输入视为可搜索线索或候选召回请求
