## MODIFIED Requirements

### Requirement: `find_session` 必须复用现有 session 搜索语义

系统 MUST 让 `find_session` 与用户侧 `/session-search` 使用同一套 session 搜索语义，包括扫描最近非归档 session、优先匹配 title、其次匹配 slug 或 session ID、最后使用有限 transcript 样本作为补充召回。该搜索语义 MUST 支持单关键词与空格分隔的多关键词查询，并在多关键词查询中按匹配质量确定候选排序。

#### Scenario: 元信息优先匹配

- **WHEN** `find_session` 的查询命中 session title、slug 或 session ID
- **THEN** 系统优先基于这些元信息返回候选结果，而不是先读取完整 transcript

#### Scenario: transcript 样本补充召回

- **WHEN** 当前搜索窗口中存在未被元信息命中但被有限 transcript 样本命中的候选 session
- **THEN** 系统 MAY 读取候选 session 的有限 transcript 样本做补充关键词匹配

#### Scenario: 空格分隔的多关键词查询召回候选 session

- **WHEN** `find_session` 或 `/session-search` 接收包含多个以空格分隔的非空关键词的查询
- **THEN** 系统使用同一套搜索核心匹配这些关键词，并返回命中至少一个有效关键词的候选 session

#### Scenario: 完整查询短语优先于部分关键词命中

- **WHEN** 一个 session 命中完整归一化查询短语，另一个 session 只命中其中部分关键词
- **THEN** 系统将完整短语命中的候选排序在同一 match bucket 内更靠前

#### Scenario: 多关键词匹配质量影响排序

- **WHEN** 多个 session 匹配同一多关键词查询但命中的关键词数量或匹配质量不同
- **THEN** 系统在稳定 match bucket 基础上优先返回匹配质量更高的候选，再按更新时间倒序排序

#### Scenario: 搜索结果保持确定性排序

- **WHEN** 多个 session 对同一查询具有相同的 match bucket 与匹配质量
- **THEN** 系统按更新时间倒序和稳定 tie-breaker 返回结果，避免依赖模型自由排序
