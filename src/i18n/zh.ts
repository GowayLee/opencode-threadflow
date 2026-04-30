export const zh = {
  // ── Commands ────────────────────────────────────────────────

  "command.handoff.template": `为新的 session 创建一份可编辑的 handoff note。

背景：
- 新 session 经常会花时间重新找文件、重读代码、恢复已确认的决策和约束。
- 好的 handoff 应降低接手成本，让新的 session 能理解当前工作状态并继续判断。
- 优先服务上下文交接和后续承接，不要写成归档总结、回顾摘要或完整实施计划。

输入语义：
- 用户提供的 goal 文本：

"""
$ARGUMENTS
"""

(如果用户没有提供 goal，这里会是空白文本)

- 如果 goal 文本非空，把它视为接续方向或粗略任务线索。它只用于指导你筛选和强调当前 session 中相关的事实、决策、约束、问题和文件线索。
- 不要把 goal 当成下一 session 必须立即执行的 primary goal，也不要围绕它输出完整方案设计、实施计划或细粒度任务拆分。
- 如果 goal 文本为空或只有空白，从当前 session 推断最自然的接续方向。
- 推断接续方向时，优先选择已经在进行但未完成的工作、用户已确认的方向，或最能减少重新发现成本的切入点。

你的任务：
- 分析当前 session，只提取新 session 接手上下文所需的信息。
- 保留影响后续判断的事实：当前状态、已确认决策、约束、用户偏好、技术模式、相关文件和未解决问题。
- 只在会影响接手方向时保留已验证的问题、失败尝试或被拒绝的选项。
- 排除闲聊往返、泛化复述、低信号岔路和 meta commentary。
- 让 note 帮助新的 session 理解上下文并开始接手，而不是替新的 session 完成规划。
- 不要猜测或补造缺失信息。不确定的内容要窄化表述，并保持事实性。

输出约束：
- 只输出 handoff note 本身。
- 不要在 note 前后添加额外 commentary。
- 不要在 note 内提出 follow-up question。
- Note 必须保持为用户可编辑、可复制的 plain Markdown。

源 session 引用：
- 当前 session 有一个以 \`ses_\` 开头的 ID，由 command context 提供。
- 在 note 顶部包含真实 session ID，并说明新的 agent 可按需调用 \`read_session\` 获取完整上下文。
- 接收 handoff 的 agent 应先使用 note，再仅在需要 note 未覆盖的细节时回退到 \`read_session\`。

顶部 marker 块：
- 你必须先输出 marker 块，再输出 \`## Handoff Note\`。
- 无 resolved predecessor sessions 时：
  \`\`\`
  [handoff-source-chain]: <session ID label; session ID label; …>
  [handoff-id]: <本次 handoff ID>
  \`\`\`
- 有 resolved predecessor sessions 时：
  \`\`\`
  [handoff-source-chain]: <session ID label; session ID label; …>
  [handoff-id]: <本次 handoff ID>
  [handoff-predecessor-sessions]: <resolved child session ID> <label>; ...
  \`\`\`
  label 由你基于对应前序 handoff note 的内容生成，简述该子会话的任务方向。
- \`[handoff-source-chain]:\` 必须是 note 第一行；entries 按时间顺序排列，格式为 \`ses_ID label\`，用 \`; \` 分隔。
- 上游 session ID/label、\`本次 handoff ID\`、resolved predecessor session IDs 都来自 command context；上游 label 原样复制。
- 当前 session label 由你基于当前工作总结生成，保持简短且不含 \`;\`。
- 逐字复制 \`本次 handoff ID\`；不要根据当前 session ID 推导、组合或重编号。Handoff-id 不是 child session ID，也不能传给 \`read_session\`。
- 没有 resolved predecessor sessions 时，完全省略 \`[handoff-predecessor-sessions]:\`。
- 不要把 predecessor sessions 合并进 \`[handoff-source-chain]:\`。

任务流 section：
- 当 command context 包含 "上游任务流" 或 "已解析前序子会话" 时，你 MUST 在 note 中包含 \`### 任务流\` section。
- 存在上游任务流时，输出上游链路：
  \`\`\`
  上游链路：
  \\\`<oldest session ID>\\\` label → \\\`<next session ID>\\\` label → \\\`<current session ID>\\\` label
  \`\`\`
- 存在已解析前序子会话时，输出前序子会话段（与上游链路共同构成任务流的完整视野）：
  \`\`\`
  前序子会话（从本 session 之前的 handoff note 出发）：
  - \\\`<child session ID>\\\` — <子会话任务方向简述>
  - ...
  \`\`\`
  每个子会话的简述由你基于对应前序 handoff note 的内容生成，帮助新 session 判断是否需要用 \`read_session\` 查看。
- 任务流段末尾统一包含提醒行："以上 session 均可通过 \`read_session\` 回看完整上下文。"
- 当既无上游任务流又无已解析前序子会话时，MUST NOT 输出 \`### 任务流\` section。改用现有 \`> **源 session**: \\\`ses_...\\\` — 如需更多上下文，可调用 \\\`read_session\\\` 工具查看完整记录\` 格式。

---

使用以下精确结构：

[handoff-source-chain]: <session ID label; session ID label; …>
[handoff-id]: <本次 handoff ID>
[handoff-predecessor-sessions]: <resolved child session ID> <label>; ...

## Handoff Note

<!-- 当 command context 没有 resolved predecessor sessions 时，完全省略 [handoff-predecessor-sessions]:。 -->

<!-- 当命令上下文包含上游任务流或已解析前序子会话时，使用以下任务流段： -->
### 任务流

<!-- 存在上游时： -->
上游链路：
\\\`<oldest session ID>\\\` label → \\\`<next session ID>\\\` label → \\\`<current session ID>\\\` label

<!-- 存在前序子会话时： -->
前序子会话（从本 session 之前的 handoff note 出发）：
- \\\`<child session ID>\\\` — <子会话任务方向简述>

以上 session 均可通过 \`read_session\` 回看完整上下文。

<!-- 当既无上游又无前序子会话时，使用以下源引用行替代 ### 任务流 段： -->
> **源 session**: \\\`<session ID>\\\` — 如需更多上下文，可调用 \\\`read_session\\\` 工具查看完整记录

### 当前任务背景
- 只描述当前活跃工作、当前状态，以及它为什么影响后续接手。

### 已确认决策
- 记录已经确认的决策。
- 包含会影响后续工作的用户偏好。
- 除非新的 session 找到强证据，否则把这些内容视为已定事实。

### 约束条件
- 列出新的 session 必须遵守的具体约束、non-goals、边界和要求。

### 接续方向
- 说明粗粒度的接续方向，而不是完整后续计划。
- 如果用户提供的 goal 文本非空，用它筛选和强调本节以及 note 其他部分的上下文侧重点。
- 不要在这里决定未经确认的技术路线或把复杂目标拆成完整执行计划。

### 开局动作
- 给出 2-5 个粗粒度动作，帮助新的 session 开始接手上下文、确认范围或识别切入点。
- 可以锚定到具体文件、函数、模块、命令或验证入口，但不要展开成细粒度 implementation steps。
- 避免泛泛写 "understand the codebase"；如果必须写，说明应查看什么以及为什么。

### 相关文件
1. @path/to/file - 简要说明该文件的角色、关键 function/module，或为什么与接续方向有关。

---

相关文件规则：
- 只包含最有助于继续工作的文件，不要写成广泛 inventory。
- 优先包含接下来很可能阅读或编辑的文件，以及紧密相关的 dependencies、tests、configs、specs 或 reference docs。
- 宁可略微宽一点，不要漏掉关键文件；多包含一个有用文件通常比漏掉关键文件更好。
- 通常在上下文充分时包含约 5-12 个文件；只有任务确实很窄时才更少。
- 每一项必须使用格式 1. @path/to/file - <simple description>。
- 描述应说明该文件为什么重要，而不是重复文件名。
- 如果 session 已确认具体 functions、methods、modules 或 implementation points，简短提及。

质量标准：
- 具体、可接手，但不要替新的 session 做完整规划。
- 用词紧凑，让用户能不清理就复制 note 到新 session。
- 信息少时各 section 可以简短，不要为了看起来完整而填充。
- 优先优化后续 session 的上下文连续性，而不是归档完整性。`,

  "command.name_session.template": `为当前 session 生成一个符合标题协议的结构化标题，并通过 name_session tool 完成重命名。

## 标题协议：\`[动作][对象] 主题\`

格式要求：
- 三部分顺序固定：\`[动作]\` → \`[对象]\` → \`主题\`，中间用空格分隔
- 示例：\`[设计][name_session] 标题协议与实现方案\`

### 动作标签（10 个，必须选择一个）

| 标签     | 适用场景                         |
| -------- | -------------------------------- |
| [调研]   | 技术调研、资料研究、源码阅读     |
| [探索]   | 自由探索、试验性尝试、原型验证   |
| [讨论]   | 方案讨论、需求沟通、问题分析     |
| [设计]   | 架构设计、方案设计、接口设计     |
| [决策]   | 技术选型、方案取舍、方向确定     |
| [实现]   | 功能实现、代码编写、重构         |
| [调试]   | 问题排查、bug 修复、性能调试     |
| [验证]   | 测试验证、结果确认、功能验收     |
| [审查]   | 代码审查、设计审查、安全检查     |
| [交接]   | handoff 写作、上下文打包、知识传递 |

### 对象选取

选取最有检索价值的模块名、功能名、文件名、子系统名或概念名作为 \`[对象]\`，如 \`[core_service]\`、\`[user_layer]\`、\`[session_search]\`、\`[storage]\`。

不要使用泛泛词汇如 \`[问题]\`、\`[功能]\`、\`[代码]\`、\`[配置]\`。

### 主题约束

- 控制在英文 8-18 个词，中文 30-60 个字符
- 表达 session 的最终有效产物
- 保留未来可能用于搜索的关键词
- 不使用完整句子或低信息密度表达
- 不得使用 [TODO]、[意图]、[待办]、[进行中]、[已完成] 等任务管理标签

## 用户命名方向

"""
$ARGUMENTS
"""

（如果非空，agent MUST 据此调整标题的动作标签、对象选取和主题方向。例如用户输入"这是关于 todo 意图实现"表示本 session 是围绕 todo intent 的实现讨论，标题应体现 [实现][todo] 或类似方向。）

## 执行步骤

1. 分析当前 session 的对话内容和核心产出，结合用户的命名方向提示（如有）
2. 按照标题协议生成一个符合规范的标题
3. 调用 \`name_session\` tool 传入 \`title\` 参数完成重命名
4. 完成后提醒用户：当前轮用于重命名标题的对话会对本 session 的任务主线造成噪音污染，建议用户在确认标题后回滚（撤销/删除）本次重命名相关的消息轮次，仅保留标题变更结果`,

  "command.session_search.template": `原样渲染插件提供的 session 搜索结果块。

规则：
- 插件可能会注入一个以 \`## Session Search Results\` 开头的 synthetic text block。
- 如果该 block 存在，逐字输出它，不输出任何其他内容。
- 如果该 block 不存在，只输出：Session search is unavailable.
- 不要总结、重排格式、解释或添加额外 commentary。

搜索 query：
"""
$ARGUMENTS
"""`,

  "command.handoff.description":
    "为新的 session 创建一份可编辑的 handoff note，用于继续当前工作",
  "command.name_session.description":
    "为当前 session 生成结构化标题并重命名，提升 session 列表可读性和 find_session 检索召回效果",
  "command.session_search.description":
    "搜索近期 session，并返回可复制的 session ID 以便显式引用",

  // ── Tools: name_session ────────────────────────────────────

  "tool.name_session.no_change": `Session 标题无需变更。

| Field      | Value          |
| ---------- | -------------- |
| Session ID | \`{sessionID}\` |
| Title      | {title}       |

新标题与当前标题相同，未执行更新操作。`,

  "tool.name_session.success": `| Field      | Value                                   |
| ---------- | --------------------------------------- |
| Session ID | \`{sessionID}\`                        |
| Old title  | {oldTitle}                             |
| New title  | {newTitle}                             |

Session 标题已更新。

> **建议**: 当前轮对话用于重命名标题，会对本 session 的任务主线造成噪音污染。建议用户在确认标题后回滚（撤销/删除）本次重命名相关的消息轮次，仅保留标题变更结果。`,

  "tool.name_session.error": `Session 重命名失败。

| Field      | Value                                   |
| ---------- | --------------------------------------- |
| Session ID | \`{sessionID}\`                        |
| Old title  | {oldTitle}                             |
| New title  | {newTitle} (未应用)                    |
| Error      | {reason}                               |

请检查权限后重试。`,

  "tool.name_session.unapplied": "（未应用）",

  // ── Tools: find_session ────────────────────────────────────

  "tool.find_session.no_recent_sessions": "未找到近期未归档 session。",
  "tool.find_session.no_results":
    "未找到匹配的 session。\n\n请尝试更具体或不同的 query。",
  "tool.find_session.query_label": "Query:",
  "tool.find_session.window_label": "窗口：近期",
  "tool.find_session.window_suffix": "个未归档 session",
  "tool.find_session.results_label": "结果：",
  "tool.find_session.table.session_id": "Session ID",
  "tool.find_session.table.label": "标签",
  "tool.find_session.table.updated_at": "更新时间",
  "tool.find_session.table.match": "匹配位置",
  "tool.find_session.footer_hint":
    '如需检查候选项，请使用完整 Session ID 和 `mode: "preview"` 调用 `read_session` 获取精简消息预览；若确认相关，再用 `mode: "full"` 调用 `read_session` 获取完整 context pack。',

  // ── Tools: read_session ────────────────────────────────────

  "tool.read_session.incomplete_id":
    "read_session 需要完整的 `session-id`，如 `ses_...`；不支持关键词或截断 ID。",
  "tool.read_session.not_found": "未找到 `{sessionID}` 对应的 session。",
  "tool.read_session.unreadable": "无法读取 session。",

  // ── Tools: search rendering ────────────────────────────────

  "tool.search.no_results": "未找到匹配的 session。",
  "tool.search.query_label": "Query:",
  "tool.search.window_label": "窗口：近期",
  "tool.search.window_suffix": "个未归档 session",
  "tool.search.results_label": "结果：",
  "tool.search.usage": "用法：`/search-session <keyword>`",
  "tool.search.table.session_id": "Session ID",
  "tool.search.table.label": "标签",
  "tool.search.table.updated_at": "更新时间",
  "tool.search.table.match": "匹配位置",

  // ── Hooks: handoff ─────────────────────────────────────────

  "hook.handoff.current_session_id": "当前 session ID: `{sessionID}`",
  "hook.handoff.handoff_id": "本次 handoff ID: `{handoffID}`",
  "hook.handoff.upstream_chain": "上游任务流: {chain}",
  "hook.handoff.read_session_hint":
    "可通过 `read_session` 逐级回溯完整任务意图。",
  "hook.handoff.resolved_predecessors":
    "已解析前序子会话（`via` 后的 handoff-id 指向 transcript 中对应 handoff note，用于生成子会话标签）:",
  "hook.handoff.predecessor_source_item": "- `{sessionID}` via `{handoffID}`",
  "hook.handoff.predecessor_hint":
    "这些前序子会话仅是可通过 `read_session` 回看的 source pointer，不是事实摘要。",
  "hook.handoff.unresolved_predecessors": "未解析前序 handoff:",
  "hook.handoff.dont_fabricate": "不要为未解析 handoff 编造子会话 ID。",

  // ── Hooks: name_session ────────────────────────────────────

  "hook.name_session.current_session_id": "当前 session ID: `{sessionID}`",
  "hook.name_session.current_title": "当前 session 标题: {title}",
  "hook.name_session.title_unavailable": "（未获取到标题）",

  // ── Commands: resume-work ──────────────────────────────────

  "command.resume_work.description":
    "加载近期 session 上下文，快速恢复近期工作",

  "command.resume_work.template": `阅读上方注入的 session context pack（标记为 synthetic），了解近期工作状态。

每个 context pack 的结构：
- ## Session — 标题、ID 和时间，快速判断该 session 在做什么
- ## Transcript — 对话历史，从中提取关键决策和进展
- ## Activity — 文件读写、命令执行、补丁列表，作为参考
- ## Compressed Content — 截断内容，可能不完整
先浏览各 session 的 ## Session 标题建立全局印象，再对相关 session 的 ## Transcript 提取决策和进展。

你的任务：
- 总结近期工作状态，包括关键决策、当前进展和未解决的问题。
- 表明你已准备好从近期工作停止的地方继续推进。
- 保持足够简洁，让用户快速了解「做了什么、状态如何」即可。

输出组织形式（根据实际内容灵活决定，不套固定模板）：
- 按工作线或主题线合并，而不是按 session 逐个罗列。
- 如果多个 session 围绕同一工作线，自然会合成一条；如果有多个独立工作线，自然会分开。
- 具体形式由你根据内容灵活选择。

边界情况：
- 如果注入的上下文仅包含一条系统消息说明未找到近期 session，直接说明未找到近期工作上下文，并表示愿意协助当前请求。
- 如果部分 session 加载失败，不在总结中逐一列出失败项，在末尾加一行说明 N 个 session 加载失败，可通过 find_session 手动查找。`,

  // ── Hooks: resume-work ─────────────────────────────────────

  "hook.resume_work.no_recent_sessions":
    "未找到当前 session 之外的近期非归档 session。没有可恢复的近期工作上下文。",

  "hook.resume_work.session_not_found": "Session 未找到",

  "hook.resume_work.session_load_failed": "加载 session 上下文失败",

  "hook.resume_work.all_failed": "无法加载任何近期 session 的上下文：",

  "hook.resume_work.partial_load_failures": "以下近期 session 未能加载：",

  // ── Render: placeholders & labels ──────────────────────────

  "render.untitled": "[未命名]",
  "render.missing_user_message": "[缺失用户消息]",
  "render.no_included_turns": "[无包含的轮次]",
  "render.none": "[无]",
  "render.unknown": "[未知]",
  "render.file_content_truncated": "[文件内容已截断]",
  "render.synthetic_content_truncated": "[synthetic 内容已截断]",
  "render.reasoning_omitted": "[reasoning 已省略]",
  "render.tool_output_truncated": "[工具输出已截断]",
  "render.repeated_file_read_omitted": "[重复文件读取已省略]",
  "render.unknown_subtask": "[未知子任务]",
  "render.no_previewable_turns": "[无可预览的用户/助手消息轮次]",
  "render.middle_turns_omitted": "... [中间省略 {count} 个轮次] ...",
  "render.preview_notice_title": "## 预览说明",
  "render.preview_notice_line": "- 这是仅包含选中用户/助手消息的精简预览。",
  "render.preview_notice_read_full":
    '- 使用 read_session mode "full" 和相同的完整 session ID ({sessionID}) 获取完整上下文。',
  "render.role.user": "用户",
  "render.role.assistant": "助手",
  "render.file_context": "文件上下文",
  "render.qualifier.synthetic": "synthetic",
  "render.qualifier.truncated": "已截断",
  "render.assistant_activity": "助手活动",
  "render.activity.read.title": "读取",
  "render.activity.read.summary": "读取 {count} 个文件：",
  "render.activity.commands.title": "命令",
  "render.activity.commands.summary": "执行 {count} 条命令：",
  "render.activity.patches.title": "补丁",
  "render.activity.patches.summary": "修改 {count} 个文件：",
  "render.activity.questions.title": "问题",
  "render.activity.questions.summary": "回答 {count} 个问题：",
  "render.activity.subtasks.title": "子任务",
  "render.activity.subtasks.summary": "启动 {count} 个子任务：",

  // ── Render: injector prompt ─────────────────────────────────

  "render.injector_prompt":
    "在回复时，请先给出一个简短的 session 引用加载报告。对每个成功加载的 session，列出 session ID 和标题。对每个失败的引用，注明失败原因。报告保持简洁——每个引用最多一行。不要在加载报告后停止。继续处理用户当前的请求，在相关时使用已加载的 session 内容作为参考材料。",
} as const;
