## 1. 搜索查询解析

- [x] 1.1 在 `src/session-reference/search.ts` 中新增内部 `ParsedSearchQuery` 结构，保留完整归一化短语和空格分隔关键词列表。
- [x] 1.2 调整空查询处理，确保空白查询仍不触发 session 列表读取或 transcript fallback。
- [x] 1.3 确保无空格的查询仍按单个 term 处理，不引入中文分词、标点分隔或语义扩展。

## 2. 匹配与排序实现

- [x] 2.1 新增统一匹配分析逻辑，返回完整短语命中、命中关键词和匹配质量分值。
- [x] 2.2 调整 title 匹配，使其支持完整短语与空格分隔关键词，并保持 title bucket 优先。
- [x] 2.3 调整 slug/session ID 匹配，使其支持完整短语与空格分隔关键词，并保持 slug-or-id bucket 次序。
- [x] 2.4 调整 transcript sample fallback，使其复用同一匹配分析逻辑并返回匹配质量。
- [x] 2.5 调整 `SearchResult` 构建与 `compareSearchResults()`，按 bucket、完整短语命中、命中关键词数量、更新时间、session ID 稳定排序。
- [x] 2.6 确认 `/session-search` 默认 10 条上限和 `find_session` 当前搜索窗口全量输出行为不变。

## 3. Agent 调用说明

- [x] 3.1 更新 `src/session-reference/find-session-tool.ts` 的 tool description，说明 `query` 支持一个或多个空格分隔关键词。
- [x] 3.2 更新 `query` 参数描述，给出 agent 友好的空格分隔调用方式。
- [x] 3.3 确认 `find_session` 输出仍只包含候选列表和完整 session ID，不新增 context pack、自动读取或 metadata 协议。

## 4. 测试覆盖

- [x] 4.1 在 `tests/session-reference/search.test.ts` 中覆盖空格分隔多关键词可召回命中任一关键词的候选。
- [x] 4.2 在 `tests/session-reference/search.test.ts` 中覆盖完整短语命中优先于部分关键词命中。
- [x] 4.3 在 `tests/session-reference/search.test.ts` 中覆盖命中更多关键词的候选排序更靠前。
- [x] 4.4 在 `tests/session-reference/search.test.ts` 中覆盖相同匹配质量时按更新时间和 session ID 稳定排序。
- [x] 4.5 在 `tests/session-reference/find-session-tool.test.ts` 中覆盖 tool 描述或输出边界：多关键词调用不生成 context pack、不自动读取 session、不依赖 metadata。
- [x] 4.6 确认既有单关键词搜索、transcript fallback 和 `/session-search` 10 条上限测试仍通过。

## 5. 验证

- [x] 5.1 运行 `bun run typecheck` 并修复类型错误。
- [x] 5.2 运行 `bun test tests` 并修复测试失败。
- [x] 5.3 运行 `openspec validate add-multi-keyword-session-search` 并确认 change 有效。
