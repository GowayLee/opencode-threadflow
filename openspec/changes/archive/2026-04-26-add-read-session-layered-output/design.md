## Context

当前 `find_session` 已能通过单关键词或空格分隔多关键词返回候选 session ID，但候选后的读取只有 `read_session` 完整 context pack。完整包适合继续工作，却不适合 discovery 阶段快速判断候选是否相关，因为其中会包含完整 transcript、工具活动、文件读取、文件编辑和 Activity 汇总。

`read_session` 目前在 `src/session-reference/read-session-tool.ts` 中只接收 `sessionID`，校验完整 `ses_...` ID 后调用 `buildSessionContextPack()`。`refinement.ts` 已有 transcript 归一化、turn 组装、消息压缩、工具活动提炼和 full context pack 渲染管线。preview 模式应复用其中的读取、归一化和 turn 组装能力，但不复用工具活动渲染和 Activity 汇总输出。

## Goals / Non-Goals

**Goals:**

- 为 `read_session` 增加 `preview` 与 `full` 两层输出，未指定时默认 `full`。
- 让 preview 用首尾窗口展示 session 的具体 user / assistant 消息内容，帮助 agent 判断候选是否相关。
- 让 preview 明确是删减版本，并提示可用 `full` 获取完整上下文。
- 让 preview 只包含消息正文，不包含工具调用、文件读取、文件编辑、patch、metadata、Activity section 或 Compressed Content section。
- 更新 `find_session` 的 agent-facing 提示，使 agent 知道可结合 `read_session` preview/full 使用。
- 保持 `@@ses_...` 显式引用注入仍使用完整 context pack。

**Non-Goals:**

- 不把 `read_session` 改成搜索入口，不接受关键词、截断 ID 或模糊标识。
- 不让 `find_session` 自动调用 `read_session`，也不把 preview 塞进搜索结果表格。
- 不改变 `/session-search` 的用户侧输出协议。
- 不新增语义总结、LLM 总结、向量召回或中文分词。
- 不在本次变更中设计多档 preview、分页、可配置窗口大小或 token budget 参数。

## Decisions

### Decision 1: `read_session` 使用可选 `mode` 参数

`read_session` 的参数扩展为 `sessionID` 加可选 `mode?: "full" | "preview"`。默认值是 `full`，这样现有调用、测试和显式引用路径不需要迁移。

选择这个方案是因为它最小化 API 变化，并且符合 agent 读取流程：先拿到完整 session ID，再选择读取层级。`mode` 只影响输出层级，不影响完整 ID 校验、session 读取和权限边界。

替代方案是新增 `preview_session` 工具。该方案会让 agent 多学一个工具，并引入两个工具之间的边界解释问题，因此不采用。

替代方案是让 `find_session` 增加 `preview: true` 参数。该方案会把候选搜索和内容读取混在一起，破坏现有职责分离，因此不采用。

### Decision 2: preview 在 `refinement.ts` 中新增独立 renderer

实现上在 `refinement.ts` 中增加 preview 渲染路径，例如 `buildSessionPreviewPack()` 或等价内部函数。该路径复用 session/messages 读取、`normalizeTranscript()` 和 `assembleTurns()`，然后执行 preview 专用的 turn 选择和消息-only 渲染。

full 模式继续走现有 `buildSessionContextPack()` 和 `renderContextPack()`，不要为了 preview 改动 full context pack 的结构。

替代方案是在 full context pack 渲染后做字符串裁剪。该方案容易误保留 Activity、工具活动或 Compressed Content，并且对未来格式变动脆弱，因此不采用。

替代方案是在 `read-session-tool.ts` 中直接拼 preview 字符串。该方案会把 transcript 精炼逻辑挪出 session-reference 的 refinement 层，违反当前模块分工，因此不采用。

### Decision 3: preview 先选有效 turns，再渲染消息正文

preview 的有效 turn 定义为：该 turn 中至少存在一个可渲染的普通 user 或 assistant 文本消息。选择流程如下：

1. 用 `normalizeTranscript()` 将 SDK messages 归一化。
2. 用 `assembleTurns()` 维持 user 与 assistant 的 turn 关系。
3. 从每个 turn 中提取普通 user / assistant text part，忽略 tool、patch、file、reasoning、step-finish、other 和 synthetic metadata。
4. 过滤掉没有任何可渲染消息正文的 turns。
5. 选取最早 2 个有效 turns 和最近 3 个有效 turns。
6. 合并首尾窗口，按原始 turn 顺序去重。
7. 如果存在未被选中的中间有效 turns，渲染稳定省略标记。

这个顺序保证 preview 的窗口基于“agent 能读到的消息内容”选择，而不是基于包含工具噪音的原始事件选择。

普通消息正文在 preview 中保留原文片段，不做自由总结。首版不引入可配置窗口大小，也不引入额外语义排序。

### Decision 4: preview 输出格式与 full context pack 明确区分

preview 输出使用独立标题，例如 `# Session Context Preview`。建议结构如下：

```md
# Session Context Preview

## Session

- Title: ...
- Updated At: ...

## Transcript Preview

### Turn T1

- User: ...
- Assistant: ...

... [N middle turns omitted in preview] ...

### Turn T9

- User: ...
- Assistant: ...

## Preview Notice

- This is a trimmed preview containing only selected user/assistant messages.
- Use read_session with mode "full" and the same session ID for complete context.
```

preview 不输出 `## Activity`、`## Compressed Content`、assistant activity、工具调用明细、文件路径列表、patch 列表或注入 metadata。这样 agent 不会把 preview 误认为完整上下文，也不会在 discovery 阶段被工具细节干扰。

替代方案是复用 `# Session Context Pack` 标题并在底部提示 preview。该方案容易让 agent 误判为完整 pack，因此不采用。

### Decision 5: `find_session` 只更新提示，不改变搜索语义

`find_session` 的 tool description 和结果 footer 需要说明推荐流程：先用 `find_session` 查候选，再用返回的完整 session ID 调用 `read_session` 的 `preview` 模式查看删减消息预览，必要时再用 `full` 模式读取完整上下文。

搜索核心、match bucket、排序、结果表格字段和 `/session-search` 行为不变。`find_session` 不自动读取 preview，也不在结果中附加任何 transcript 内容。

### Decision 6: 显式引用路径不使用 preview

`@@ses_...` 显式引用注入继续调用完整 context pack。该路径的目标是把历史 session 作为当前轮参考材料注入，和 discovery 阶段的候选判别不同。

因此 `injector.ts` 不需要新增 preview 分支。若未来用户希望显式引用也支持轻量注入，应作为单独 change 讨论。

## Risks / Trade-offs

- [Risk] preview 只看首尾 turns，可能漏掉中间关键决策。
  Mitigation: 输出稳定省略标记和 full 提示，引导 agent 在候选相关时读取完整上下文。

- [Risk] 某些 session 的单条消息很长，首尾窗口仍可能占用较多上下文。
  Mitigation: 首版先用固定 turn 窗口控制范围，不加入复杂 token budget；如后续样本显示仍过长，再单独设计 per-message preview budget。

- [Risk] 排除工具和文件活动会让 preview 看不到实际改动文件。
  Mitigation: preview 明确定位为候选判别；需要工具活动和文件改动时使用 full 模式。

- [Risk] agent 可能误把 preview 当作完整事实依据。
  Mitigation: preview 标题、Preview Notice 和 `find_session` 提示都明确说明这是删减版。

- [Risk] 新增模式可能影响现有 `read_session` 调用。
  Mitigation: `mode` 可选且默认 `full`，现有调用路径保持原行为。

## Migration Plan

- 扩展 `read_session` tool schema，新增可选 `mode` 参数并默认 `full`。
- 在 `refinement.ts` 新增 preview 构建和渲染函数，复用读取、归一化和 turn 组装逻辑。
- 更新 `find-session-tool.ts` 的 description 和结果 footer，加入 preview/full 推荐流程。
- 补充 `read-session-tool.test.ts`，覆盖默认 full、显式 full、preview、非法 ID、preview 不含 Activity/工具/文件活动、preview notice。
- 补充 `find-session-tool.test.ts`，覆盖工具或结果提示中包含 preview/full 后续读取说明。
- 运行 `bun run typecheck`、`bun test tests` 和 `openspec validate add-read-session-layered-output`。

Rollback 策略是删除 `mode` 参数和 preview 渲染路径，并恢复 `find_session` 的提示文案。由于默认 full 保持兼容，正常情况下不需要数据迁移。

## Open Questions

- 暂无。首版固定首 2 个有效 turns 和末 3 个有效 turns；如果真实使用中仍过长或遗漏过多，再另开 change 设计可配置预算或更细粒度预览。
