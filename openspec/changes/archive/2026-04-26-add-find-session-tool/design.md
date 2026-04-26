## Context

当前仓库已经有三条 session 相关链路：用户通过 `/session-search <关键词>` 查找候选 session；用户通过 `@@<session-id>` 显式引用历史 session；agent 通过 `read_session` 使用完整 session ID 读取 context pack。缺口在于 agent 只能读取已知 session，不能先搜索候选 session。

现有搜索实现集中在 `src/session-reference/search.ts`：`searchSessions()` 会扫描最近 200 个非归档 session，先匹配 title，再匹配 slug 或 session ID，最后在结果不足时读取有限 transcript 样本补充召回，当前默认最多返回 10 条结果。`/session-search` 只是把这套搜索结果渲染为 command synthetic text。`read_session` 则已经通过 `tool()` 定义、`plugin.ts` 的 `tool` map 和 `config.tools` 暴露给 agent。

本 change 的设计重点是把已有搜索能力以最小方式暴露为 `find_session` agent tool，同时不改变显式引用注入、`read_session` 完整 ID 读取和 `/session-search` 用户命令的边界。

## Goals / Non-Goals

**Goals:**

- 新增 `find_session` agent tool，使 agent 能用关键词查找候选 session。
- 复用 `searchSessions()`，让 agent tool 与 `/session-search` 保持一致的搜索语义。
- 返回单页 Markdown 候选结果，包含当前搜索窗口内的全部匹配项，以及完整 session ID、label、updatedAt、match、query、scanned window。
- 保持职责分离：`find_session` 只搜索候选；`read_session` 才读取完整 context pack；`@@<session-id>` 仍由插件层注入上下文。
- 保持实现小而可测试，不引入索引、缓存、新 transcript 精炼流程或 agent prompt 后处理。

**Non-Goals:**

- 不把 `/session-search` 改造成 `find_session` 的别名，也不移除用户侧 slash command。
- 不让 `find_session` 自动调用 `read_session`。
- 不让 `find_session` 自动注入 session reference context。
- 不支持语义搜索、向量检索、全文索引、分页续扫或跨工作区搜索。
- 不为 `find_session` 引入分页参数、offset/cursor 或多轮翻页协议。
- 不通过 tool metadata 传递搜索结果或依赖 OpenCode 应用层消费 metadata。
- 不改变 `read_session` 对完整 session ID 的输入限制。

## Decisions

### Decision 1: 新增独立 `find-session-tool.ts`，复用 `read_session` 的 tool 注册模式

实现应新增 `src/session-reference/find-session-tool.ts`，导出：

```ts
export const FIND_SESSION_TOOL_NAME = "find_session";

export function createFindSessionTool({ client, directory }: FindSessionToolParams) {
  return tool({
    description: "Search recent sessions by keyword and return candidate session IDs",
    args: {
      query: tool.schema.string().min(1).describe("Keyword to search for in recent sessions"),
    },
    execute: async ({ query }, context) => { ... },
  });
}
```

`plugin.ts` 中与 `read_session` 并列注册：

```ts
tool: {
  [READ_SESSION_TOOL_NAME]: createReadSessionTool(...),
  [FIND_SESSION_TOOL_NAME]: createFindSessionTool(...),
}

config.tools = {
  ...(config.tools ?? {}),
  [READ_SESSION_TOOL_NAME]: true,
  [FIND_SESSION_TOOL_NAME]: true,
};
```

选择该方案的原因：

- 与现有 `read-session-tool.ts` 的模式一致，减少新概念。
- `plugin.ts` 仍只负责装配，不承载搜索实现。
- tool execute 与 slash command hook 分离，符合 specs 中“Tool 注册不依赖 slash command 执行”的要求。

备选方案与放弃原因：

- 在 `plugin.ts` 里直接内联 `tool()`：实现更短，但会把 session-reference 逻辑塞回插件入口，违背当前目录约定。
- 让 agent 执行 `/session-search` command：这会混淆用户命令与 agent tool，也会让结构化参数、tool metadata 和测试边界变差。

### Decision 2: `find_session` 直接调用 `searchSessions()`，不复制搜索逻辑

`find_session` 的 execute 应 trim `query` 后调用：

```ts
const resultSet = await searchSessions({
  client,
  directory,
  query: normalizedQuery,
});
```

空查询由 tool 层先返回清晰结果，或交给 `searchSessions()` 返回空结果；实现应保证不会对空白查询执行候选召回。

选择该方案的原因：

- `/session-search` 与 `find_session` 的搜索窗口、匹配分桶和排序天然一致。
- 避免出现两套 session 搜索实现和两套测试预期。
- 后续如果优化搜索，只需要改 `searchSessions()`。

备选方案与放弃原因：

- 为 tool 单独实现一套搜索：短期可定制输出，但长期会造成 command 与 tool 行为漂移。
- 直接复用 `buildSessionSearchCommandParts()`：它返回 command part，包含 slash command 专属用法提示，不适合作为 agent tool 的核心输出。

### Decision 3: `find_session` 输出单页 Markdown 结果，不做分页

现有 `renderSearchResults()` 是 `search.ts` 内部函数，输出标题是 `Session Search Results`，格式偏用户命令结果。`find_session` 可以有两种实现路径：

- 在 `find-session-tool.ts` 中基于 `SearchResultSet` 自己渲染 tool 输出。
- 在 `search.ts` 中导出一个通用渲染函数，例如 `renderSessionSearchResults()`，并让 command/tool 共享。

推荐第一版采用 tool 文件内的轻量渲染，避免为了一个 tool 过早扩大 `search.ts` 的公开 API；但需要从 `search.ts` 导出 `SearchResultSet` / `SearchResult` 类型，或用 TypeScript 推断避免重复结构定义。

`find_session` 第一版返回当前搜索窗口内的全部匹配结果，不提供 `page`、`offset`、`cursor` 或 `limit` 参数。对于 agent tool 来说，分页会制造额外的状态管理负担：agent 需要记住上一页查询和页码，还可能在多轮工具调用中混淆候选集合。第一版更适合一次性给出完整候选集；如果结果太多或不够相关，agent 应调整关键词再次搜索，而不是翻页。

这意味着 `find_session` 不能直接使用当前固定 `DEFAULT_RESULT_LIMIT = 10` 的返回截断。实现应把 `searchSessions()` 改造成可配置结果上限，或新增内部搜索入口，让 `/session-search` 继续保留 10 条用户侧展示上限，而 `find_session` 获取当前 200 个 session 搜索窗口内的全部匹配项。

推荐 tool 输出结构：

```text
# Session Search Results

Query: `...`
Window: recent N non-archived sessions
Results: M

| Session ID | Label | Updated At | Match |
| --- | --- | --- | --- |
| `ses_...` | ... | ... | title |

To inspect a candidate, call `read_session` with the complete Session ID.
```

无结果输出：

```text
# Session Search Results

Query: `...`
Window: recent N non-archived sessions

No matching sessions found.

Try a more specific or different query.
```

空查询输出：

```text
# Session Search Results

No query provided. Call `find_session` with a non-empty `query` keyword.
```

选择该方案的原因：

- Markdown 表格对 agent 和人都可读，且与现有 command 结果接近。
- 完整 session ID 用 code span 保留，便于后续 `read_session` 使用。
- 显式提示 agent 可调用 `read_session`，能降低“搜索结果已是完整上下文”的误读概率。
- 单页全量结果避免引入分页状态，agent 可以基于一次工具调用看到完整候选集合。
- 不返回 transcript 内容，符合职责边界。

备选方案与放弃原因：

- 返回 JSON 字符串：机器可读性更强，但当前 `read_session` 和 command 输出都以 Markdown 为主，且 agent 消费 Markdown 表格已经足够稳定。
- 增加分页参数：理论上能分批遍历更多结果，但会让 agent tool 调用变成多步状态协议；第一版更应一次性输出当前搜索窗口内的全部匹配，并在结果过多时鼓励收窄查询。
- 返回对象 metadata 作为主结果：OpenCode tool result 支持 metadata，但用户看不到 metadata，本项目也不做 OpenCode 应用层消费，因此不应引入 metadata 协议。

### Decision 4: 不为 `find_session` 写入 tool metadata

`find_session` 的可消费信息全部放在返回的 Markdown output 中，不调用 `context.metadata()` 作为搜索结果协议的一部分。

选择该方案的原因：

- 用户看不到 tool metadata。
- 本项目不实现 OpenCode 应用层，也没有稳定消费 metadata 的位置。
- 避免出现 output 与 metadata 两份结果协议，降低测试与维护成本。

备选方案与放弃原因：

- 写入 query、scanned、resultCount metadata：对 UI 日志可能有帮助，但当前没有消费者，价值不足。
- 把每个候选也写入 metadata：会制造不可见且未消费的第二份结果通道。

### Decision 5: 测试以 tool 边界和搜索复用为主

新增测试建议放在 `tests/session-reference/find-session-tool.test.ts`。测试重点：

- 空白 query 返回可解释结果，不触发候选召回。
- 命中 title / slug-or-id / transcript 时输出完整 session ID 与 match。
- 无结果时输出 `No matching sessions found.`。
- 有结果时输出 `read_session` 后续读取提示。
- 结果不包含 context pack 标题或完整 transcript 正文。
- tool 不依赖 metadata 承载搜索结果。
- `plugin.ts` 注册并启用 `find_session`，可通过导出常量或插件返回结构验证。

选择该方案的原因：

- `searchSessions()` 已有搜索逻辑测试；tool 测试不需要重复穷举所有搜索排序细节。
- 新增测试主要保护工具职责边界和注册行为。

备选方案与放弃原因：

- 只测 `searchSessions()`：无法覆盖 agent tool 的结构化参数、metadata 和输出边界。
- 做端到端真实 OpenCode 调用：更接近运行态，但成本高，不适合作为第一版必要测试。

## Risks / Trade-offs

- [Agent 可能把候选搜索当成已加载上下文] → Tool description 和输出文案明确说明结果只是候选；需要完整上下文时继续调用 `read_session`。
- [Markdown 表格对 agent 来说不如 JSON 严格] → 保持完整 session ID、固定列和 match 字段；第一版不增加 JSON 双协议。
- [全量输出可能让结果较长] → 第一版仍限制搜索窗口为最近 200 个非归档 session；结果过多时由 agent 收窄关键词，而不是引入分页状态。
- [Transcript fallback 可能带来额外 API 调用] → `find_session` 为了输出窗口内全部匹配，可能需要对更多候选执行有限 transcript sample；第一版仍不扩大扫描窗口，后续如有性能问题再考虑缓存或索引。
- [新增 agent 搜索可能改变产品边界感知] → Specs 明确 `find_session` 不自动注入、不自动读取、不替代用户显式引用流程。

## Migration Plan

本 change 不涉及持久化数据迁移。

实施顺序：

1. 新增 `find-session-tool.ts`，包装 `searchSessions()` 并定义输出渲染。
2. 在 `plugin.ts` 中导入、注册并启用 `find_session`。
3. 为 `find_session` 增加 tool 行为测试。
4. 运行 `bun run typecheck` 和 `bun test tests`。

回滚策略：

- 如果 tool 行为或宿主展示不稳定，可以从 `plugin.ts` 移除 `find_session` 注册与 `config.tools` 开关，保留 `/session-search` 和 `read_session` 不受影响。

## Open Questions

- 是否需要把 `SearchResult` / `SearchResultSet` 类型从 `search.ts` 导出作为稳定内部 API？第一版可导出类型以减少重复定义，但不必导出更多渲染细节。
