## Why

当前 `find_session` 与 `/session-search` 只按单个归一化查询短语匹配，agent 在只有多个零散线索时容易需要连续改词重试，才能找到目标 session。需要让同一套 session 搜索核心支持多关键词查询，降低候选召回失败和重复工具调用成本。

## What Changes

- 将 session 搜索查询从单一短语匹配增强为支持多关键词匹配，同时保留完整短语命中的优先级。
- `find_session` 与 `/session-search` 继续复用同一套 `searchSessions()` 搜索语义，因此多关键词行为会同步作用于 agent tool 与用户侧 slash command。
- 搜索结果排序需要在现有 match bucket 和更新时间基础上考虑多关键词匹配质量，使命中更多关键词或完整短语的 session 更靠前。
- `find_session` 输出仍只返回候选列表和完整 session ID，不读取完整 transcript、不生成 context pack、不自动调用 `read_session`。
- 本 change 不包含 `read_session` preview/full 分层返回；该方向后续单独设计。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `session-discovery-tool`: 增强 `find_session` 与 `/session-search` 共享的关键词搜索语义，使查询能够包含多个关键词并按匹配质量返回候选 session。

## Impact

- 影响 `src/session-reference/search.ts` 的查询归一化、metadata 匹配、transcript sample fallback 与结果排序逻辑。
- 可能影响 `src/session-reference/find-session-tool.ts` 的输出字段或说明文案，但不改变 tool 职责边界。
- 需要更新 `tests/session-reference/search.test.ts` 和 `tests/session-reference/find-session-tool.test.ts`，覆盖多关键词命中、完整短语优先、部分关键词召回和排序边界。
- 需要新增或更新 `openspec/changes/add-multi-keyword-session-search/specs/session-discovery-tool/spec.md`，描述多关键词搜索的需求变化。
- 不引入新的运行时依赖、持久化数据、索引服务或 `read_session` 参数变化。
