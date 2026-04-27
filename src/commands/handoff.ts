export const HANDOFF_COMMAND_NAME = "handoff";

export const handoffCommand = {
  description:
    "Create an editable handoff note for continuing work in a new session",
  template: `为新的 session 创建一份可编辑的 handoff note。

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
  \`<oldest session ID>\` label → \`<next session ID>\` label → \`<current session ID>\` label
  \`\`\`
- 存在已解析前序子会话时，输出前序子会话段（与上游链路共同构成任务流的完整视野）：
  \`\`\`
  前序子会话（从本 session 之前的 handoff note 出发）：
  - \`<child session ID>\` — <子会话任务方向简述>
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
\`<oldest session ID>\` label → \`<next session ID>\` label → \`<current session ID>\` label

<!-- 存在前序子会话时： -->
前序子会话（从本 session 之前的 handoff note 出发）：
- \`<child session ID>\` — <子会话任务方向简述>

以上 session 均可通过 \`read_session\` 回看完整上下文。

<!-- 当既无上游又无前序子会话时，使用以下源引用行替代 ### 任务流 段： -->
> **源 session**: \`<session ID>\` — 如需更多上下文，可调用 \`read_session\` 工具查看完整记录

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
} as const;
