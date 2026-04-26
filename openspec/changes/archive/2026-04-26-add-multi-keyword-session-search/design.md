## Context

当前 `src/session-reference/search.ts` 中的 `searchSessions()` 是 `/session-search` 与 `find_session` 共享的搜索核心。它会扫描最近 200 个非归档 session，按 title、slug/session ID、transcript sample 三个 match bucket 召回结果，并分别服务用户侧 slash command 与 agent tool。

现有实现把用户输入归一化为一个字符串后做 `includes(query)`。这对单个明确关键词有效，但当 agent 只有多个零散线索时，必须多次改词重试。例如用户说“实现 todo 内容”时，真正有帮助的线索可能分散在 title、slug 或 transcript sample 中，单一短语匹配容易漏掉候选。

本 change 只增强 session 搜索语义，不改变 `read_session`、`@@ses_...` 显式引用注入、`find_session` 的候选工具职责，也不引入索引或语义搜索。

## Goals / Non-Goals

**Goals:**

- 让 `searchSessions()` 支持单关键词和空格分隔的多关键词查询，并继续作为 `/session-search` 与 `find_session` 的唯一搜索核心。
- 保留完整查询短语命中优先级，同时允许多关键词查询通过任一有效关键词召回候选。
- 在现有 match bucket 基础上加入匹配质量排序，使完整短语命中、命中更多关键词的候选更靠前。
- 保持搜索窗口、transcript sample 限制、`/session-search` 10 条展示上限、`find_session` 当前窗口全量输出等既有边界。
- 通过测试覆盖多关键词召回、完整短语优先、匹配质量排序和原有单关键词兼容性。

**Non-Goals:**

- 不实现中文分词、词干提取、同义词扩展、向量检索或全文索引。
- 不让 `find_session` 自动读取候选 session、生成 context pack 或调用 `read_session`。
- 不改变 `read_session` 的参数、输出模式或完整 session ID 校验。
- 不改变 `@@ses_...` 显式引用解析与注入边界。
- 不为 `/session-search` 或 `find_session` 引入分页、额外搜索参数或 JSON 双协议。

## Decisions

### Decision 1: 引入内部 `ParsedSearchQuery`，同时保留完整短语和关键词

在 `search.ts` 内用内部结构替代裸字符串查询：

```ts
type ParsedSearchQuery = {
  phrase: string;
  terms: string[];
};
```

解析规则：

- `phrase` 使用现有语义的归一化查询文本，trim、lowercase，并压缩多余空白。
- `terms` 从 `phrase` 中按空白切分，去重后过滤空字符串。调用方 SHOULD 用空格分隔多个独立线索，例如 `todo 实现 openspec`。
- 如果查询没有分隔符，例如 `实现todo内容`，它仍作为一个 term 工作；本 change 不尝试自动拆中文或中英混排词。
- 空查询仍不执行候选召回。

选择该方案的原因：

- 能同时支持旧的完整短语查询和新的多关键词查询。
- 实现集中在 `search.ts`，不会影响 tool 参数形状。
- 避免引入分词库或语言相关复杂度。
- 空格分隔对 agent 最友好：tool schema、slash command 和自然语言提示都能用同一种调用方式表达。

备选方案与放弃原因：

- 让 `find_session` 接收 `keywords: string[]`：会让 `/session-search` 与 tool 语义分叉，也增加调用复杂度。
- 只做 OR 多关键词、不保留完整短语：会降低精确短语查询的排序质量。
- 支持逗号、顿号等标点分隔：输入容错更强，但会让第一版协议变得不够明确；先把 agent 推荐调用方式固定为空格分隔。
- 做中文分词或语义搜索：召回更强，但范围明显超过当前最小可交付目标。

### Decision 2: 用统一匹配分析函数评估 title、slug/id 和 transcript sample

新增内部匹配函数，例如：

```ts
type MatchAnalysis = {
  phraseMatched: boolean;
  matchedTerms: string[];
  score: number;
};
```

匹配规则：

- 若目标文本包含 `phrase`，视为完整短语命中。
- 若未完整命中，则检查 `terms` 中每个关键词是否被目标文本包含。
- `phraseMatched` 或 `matchedTerms.length > 0` 即为命中。
- `score` 用于排序：完整短语命中高于仅关键词命中；关键词命中数量越多，质量越高。

title、slug/session ID、transcript sample 都复用同一个匹配分析函数，只是 match bucket 的优先级保持不变：title 优先，其次 slug-or-id，最后 transcript。

选择该方案的原因：

- 避免 title、metadata、transcript 各自实现一套多关键词逻辑。
- `transcriptMatchesQuery()` 可以从 boolean 升级为返回 `MatchAnalysis | null`，使 fallback 结果也能参与质量排序。
- 保留现有 bucket 边界，不会因为 transcript 命中更多词就越过 title 命中。

备选方案与放弃原因：

- 只在 transcript fallback 支持多关键词：不能解决 title/slug 的多线索搜索问题，且会让语义不一致。
- 让 transcript 命中按 score 超过 metadata 命中：可能让低置信 transcript sample 抢占明确 title/slug 命中，违背现有“元信息优先”设计。

### Decision 3: 搜索结果增加内部匹配质量排序，不默认改变 Markdown 输出协议

`SearchResult` 可增加内部排序所需字段，例如 `score` 或 `matchQuality`，但默认不在 `/session-search` 与 `find_session` 表格中新增列。排序逻辑调整为：

1. match bucket 顺序：`title` → `slug-or-id` → `transcript`。
2. 完整短语命中优先。
3. 匹配关键词数量更多优先。
4. 更新时间倒序。
5. session ID 稳定 tie-breaker。

当前实现已经通过分桶数组维持 bucket 顺序，但 `renderSearchResults()` 会再次调用 `resultSet.results.sort(compareSearchResults)`，因此实现时需要让 `compareSearchResults()` 能体现 bucket 与匹配质量，避免渲染阶段破坏搜索排序。

选择该方案的原因：

- 满足 spec 中“匹配质量影响排序”的要求。
- 不扩大 `find_session` 输出协议，降低测试和文档变更成本。
- 保持 agent 仍通过完整 session ID 再选择是否读取候选。

备选方案与放弃原因：

- 在表格中新增 `Matched Terms` 列：可解释性更强，但会改变稳定输出协议；第一版先不做，除非实现中发现 agent 难以判断候选。
- 只按更新时间排序：实现最小，但无法体现多关键词查询的价值。

### Decision 4: transcript fallback 仍使用有限 sample，不扩大扫描窗口

多关键词匹配不会改变 `DEFAULT_SCAN_LIMIT = 200` 和 `DEFAULT_TRANSCRIPT_SAMPLE_LIMIT = 8`。当 metadata 结果不足 `resultLimit` 时，仍只对 fallback candidates 读取有限 transcript sample。

对于 `find_session`，因为它传入 `Number.POSITIVE_INFINITY`，当前窗口内 metadata 未命中的候选仍可能触发较多 transcript sample 调用；本 change 不扩大这一行为，只让每次 sample 检查能匹配多个关键词。

选择该方案的原因：

- 搜索成本与第一版 `find_session` 保持同一数量级。
- 避免为了多关键词引入缓存、索引或批量 transcript 读取机制。

备选方案与放弃原因：

- 扩大 transcript sample 或扫描窗口：可能提升召回，但会放大 API 调用成本，且不是当前失败模式的最小修复。
- 为 transcript 建索引：长期可能有价值，但不适合作为本 change 的前置条件。

## Risks / Trade-offs

- [多关键词 OR 召回会带来更多弱相关结果] → 通过 match bucket、完整短语优先、命中词数量和更新时间排序降低噪声；`find_session` 仍返回候选而非自动读取。
- [不做中文分词会漏掉无分隔符的组合词] → 保留原始 phrase/term 匹配；鼓励 agent 用空格分隔多个线索。中文分词可作为后续独立增强。
- [内部排序字段可能影响导出的 `SearchResult` 类型] → 字段只服务排序，不作为 Markdown 输出协议；测试应覆盖行为而不是依赖内部字段。
- [渲染阶段重新排序可能覆盖搜索阶段排序] → 更新 `compareSearchResults()`，让所有渲染路径使用同一排序规则。
- [多关键词 transcript fallback 增加候选命中数] → 不扩大 sample 和 scan limit；如后续出现性能问题，再单独评估缓存或索引。

## Migration Plan

本 change 不涉及持久化数据迁移，也不改变外部配置。

实施顺序：

1. 在 `search.ts` 中新增 query parsing 与 match analysis 内部函数。
2. 调整 metadata 匹配和 transcript fallback，使其接收 `ParsedSearchQuery` 并返回匹配质量。
3. 调整 `SearchResult` 构建与 `compareSearchResults()`，把 bucket 与匹配质量纳入排序。
4. 更新 `search.test.ts` 覆盖多关键词召回、完整短语优先、匹配质量排序和单关键词兼容。
5. 视输出文案需要更新 `find-session-tool.test.ts`；默认不新增输出列。
6. 运行 `bun run typecheck`、`bun test tests`、`openspec validate add-multi-keyword-session-search`。

回滚策略：

- 如果多关键词排序或召回噪声过高，可以回退 `search.ts` 中的 query parsing 与 match analysis 改动，恢复单一 `normalizeQuery()` + `includes(query)` 匹配；`read_session` 和显式引用链路不受影响。

## Open Questions

- 是否需要在 `find_session` 输出中展示 matched terms 以提升候选可解释性？第一版设计倾向不展示，先用排序改善发现效率。
- 是否需要在后续版本支持标点分隔或中文分词？当前版本明确只承诺空格分隔，保持 agent 调用方式简单稳定。
