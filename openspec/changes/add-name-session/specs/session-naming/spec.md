## Purpose

Define the session-naming capability so agents can rename sessions with structured, search-optimized titles following the `[动作][对象] 主题` protocol, improving session discoverability through `find_session` and readability in session lists.

## ADDED Requirements

### Requirement: 用户必须能够通过 slash command 触发命名流程

系统 SHALL 提供一个 slash command（命名如 `/name-session`），使用户能够触发当前 session 的命名流程。该命令的职责是注入标题协议指导，让 agent 基于当前 session 内容生成符合规范的标题。

#### Scenario: 用户执行命名命令

- **WHEN** 用户执行 `/name-session` 命令
- **THEN** 系统向 agent 上下文注入标题协议指导，包含动作标签集合、对象选取原则、主题约束和格式示例

#### Scenario: 命令不自动执行重命名

- **WHEN** 用户执行 `/name-session` 命令
- **THEN** 系统只注入命名指导，不自动调用 `name_session` tool 或自动覆盖 session 标题

#### Scenario: 命令接受用户命名方向输入

- **WHEN** 用户执行 `/name-session` 命令时通过 `$ARGUMENTS` 传入额外命名方向（如说明 session 是 todo intent、设计讨论、实现任务等）
- **THEN** 系统将用户输入作为命名指导的一部分注入 agent 上下文，agent 据此调整标题的动作标签、对象选取和主题方向

#### Scenario: 命令引导 agent 调用工具

- **WHEN** `/name-session` 命令的指导内容被注入 agent 上下文
- **THEN** agent 据此分析当前 session 内容、结合用户的方向提示（如有），生成符合协议的标题，并主动调用 `name_session` tool 完成重命名

### Requirement: 系统在命名命令执行前必须注入当前 session ID 和原标题

当用户执行命名 slash command 时，插件 SHALL 在命令执行前通过 `command.execute.before` hook 将当前 session 的完整 ID（格式 `ses_<字母数字>`）和当前标题注入命令上下文，使 agent 无需猜测或间接获取这些信息即可调用 `name_session` tool。

#### Scenario: 成功注入 session ID 和标题

- **WHEN** 用户在当前 session 中执行命名 slash command
- **THEN** 插件在 `command.execute.before` 中向命令上下文注入一条文本 part，内容包含当前 session 的完整 ID 和当前标题（如可用），注入内容使用 `synthetic: true` 标记

#### Scenario: 注入内容不影响其他命令

- **WHEN** 用户执行命名 slash command 以外的命令
- **THEN** 插件不注入 session ID 与标题上下文

### Requirement: agent 必须能够通过 `name_session` tool 重命名当前 session

系统 SHALL 提供一个 agent 可调用的 `name_session` tool，使 agent 能够为当前 session 设置新标题。该 tool 的职责限定为仅重命名当前 session，不接受 `sessionID` 参数；当前 session ID 由 tool 内部自动获取。该 tool MUST 通过 OpenCode SDK 的 `client.session.update()` API 执行实际重命名操作。

#### Scenario: Agent 重命名当前 session

- **WHEN** agent 调用 `name_session` 并传入 `title`
- **THEN** 系统自动获取当前 session ID，调用 `client.session.update()` 更新该 session 的 title，并返回操作结果（含新旧标题对比）

#### Scenario: 重命名失败时返回错误

- **WHEN** `client.session.update()` 调用因权限、网络或其他原因失败
- **THEN** 系统将错误信息返回给 agent，不静默忽略失败

#### Scenario: 新旧标题相同时不重复更新

- **WHEN** agent 调用 `name_session` 且传入的 `title` 与当前 session title 完全相同
- **THEN** 系统 SHALL 不调用 `client.session.update()`，并返回提示说明标题无需变更

### Requirement: session 标题必须遵循 `[动作][对象] 主题` 协议

系统 SHALL 定义标题协议为 `[动作][对象] 主题`。该协议通过 slash command 的命名指导注入给 agent，agent 据此生成标题后通过 `name_session` tool 提交。`name_session` tool 本身不校验标题格式，标题协议的正确遵循由 agent 在生成阶段负责。

#### Scenario: 标题结构正确

- **WHEN** agent 根据命名指导生成符合协议的标题
- **THEN** 标题格式为 `[动作][对象] 主题`，三部分顺序固定且用空格分隔

#### Scenario: 动作标签必须在允许集合内

- **WHEN** agent 为标题选择动作标签
- **THEN** 动作 SHALL 为以下之一：`[调研]`、`[探索]`、`[讨论]`、`[设计]`、`[决策]`、`[实现]`、`[调试]`、`[验证]`、`[审查]`、`[交接]`

#### Scenario: 对象应选取高检索价值的关键词

- **WHEN** agent 为标题选择对象标签
- **THEN** 对象 SHOULD 是项目中有检索价值的模块名、功能名、文件名、子系统名或概念名，如 `[read_session]`、`[find_session]`、`[storage]`，而不是泛泛词汇如 `[问题]`、`[功能]`、`[代码]`

#### Scenario: 主题应短而具体

- **WHEN** agent 为标题编写主题部分
- **THEN** 主题 SHOULD 控制在 8 到 18 个中文字符，表达 session 的最终有效产物，保留未来可能用于搜索的关键词，不使用完整句子或低信息密度表达

#### Scenario: 标题不得包含任务管理标签

- **WHEN** agent 为标题选择标签
- **THEN** 标题 SHALL NOT 使用 `[TODO]`、`[意图]`、`[含意图]`、`[待办]`、`[进行中]`、`[已完成]` 等任务管理标签

#### Scenario: 延后想法通过主题自然表达

- **WHEN** session 中包含未来才处理的延后想法且该想法是 session 的核心产物
- **THEN** 标题 SHOULD 在主题部分自然使用「后续」「暂缓」「预留」「待验证」「待实现」等词表达，而不是引入专门的意图标签

### Requirement: `name_session` tool 必须返回操作结果供 agent 报告

系统 SHALL 让 `name_session` tool 在成功重命名后返回包含新旧标题对比的 Markdown 输出，使 agent 能够向用户清晰报告重命名结果和变更原因。

#### Scenario: 成功重命名后返回对比

- **WHEN** `name_session` 成功重命名 session
- **THEN** tool 输出包含旧标题和新标题的对比，以及操作确认信息

#### Scenario: 返回结果包含 sessionID

- **WHEN** `name_session` 成功或失败
- **THEN** tool 输出包含被操作 session 的完整 `ses_...` ID

#### Scenario: 重命名完成后提示对话回滚

- **WHEN** `name_session` 成功重命名 session
- **THEN** tool 输出中提醒 agent 应向用户说明：当前轮用于重命名标题的对话会对该 session 的任务主线造成污染，建议用户在此轮完成后回滚（undo/删除）本次重命名相关的对话轮次，仅保留标题变更结果

### Requirement: `name_session` 不得承担工作流管理职责

系统 SHALL NOT 让 `name_session` 成为工作流状态管理工具。该能力 SHALL NOT 定义任务状态、创建 todo 数据库、引入 sidecar 存储、实现 session graph、维护状态机或要求用户改变项目结构。

#### Scenario: 重命名不改变项目结构

- **WHEN** `name_session` 重命名 session
- **THEN** 操作仅影响 session 的 title 字段，不创建额外文件、目录、数据库或元数据存储

#### Scenario: 重命名不引入任务状态

- **WHEN** `name_session` 完成重命名
- **THEN** session 不因此进入任何状态机或工作流阶段

### Requirement: `name_session` 与 `find_session` 形成互补关系

`name_session` SHALL 通过提高 session 标题质量来增强 `find_session` 的召回效果。经过良好命名的 session 标题 SHALL 作为高信噪比检索面，使 `find_session` 更易命中相关 session。`name_session` 本身 SHALL NOT 调用 `find_session` 或 `read_session`。

#### Scenario: 命名后标题可被检索

- **WHEN** session 被 `name_session` 重命名为符合协议的标题
- **THEN** 标题中的关键术语在后续 `find_session` 查询中可作为匹配目标被命中

#### Scenario: 命名工具不读取其他 session

- **WHEN** agent 调用 `name_session`
- **THEN** 系统只执行重命名操作，不调用 `find_session`、`read_session` 或读取其他 session 的 transcript
