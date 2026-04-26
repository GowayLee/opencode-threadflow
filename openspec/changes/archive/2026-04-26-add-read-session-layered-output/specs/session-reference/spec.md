## ADDED Requirements

### Requirement: `read_session` 必须支持分层输出模式

系统 MUST 让 `read_session` 支持 `full` 与 `preview` 两种输出模式。调用方未显式指定模式时，系统 MUST 使用 `full` 模式以保持现有完整 context pack 行为；调用方指定 `preview` 时，系统 MUST 返回用于候选判别的轻量预览结果。输出模式不得改变 `read_session` 只接受完整 session 标识的输入边界，也不得让该工具承担关键词搜索、候选召回或模糊匹配职责。

#### Scenario: 未指定模式时保持完整输出

- **WHEN** 调用方使用完整 session 标识调用 `read_session` 且未指定输出模式
- **THEN** 系统返回与现有行为兼容的完整引用上下文包

#### Scenario: 显式请求 full 模式

- **WHEN** 调用方使用完整 session 标识调用 `read_session` 且指定 `mode` 为 `full`
- **THEN** 系统返回完整引用上下文包

#### Scenario: 显式请求 preview 模式

- **WHEN** 调用方使用完整 session 标识调用 `read_session` 且指定 `mode` 为 `preview`
- **THEN** 系统返回该 session 的轻量预览结果，而不是完整引用上下文包

#### Scenario: agent 可直接请求 preview 模式

- **WHEN** agent 在任意需要快速查看指定 session 内容的场景中使用完整 session 标识调用 `read_session` 且指定 `mode` 为 `preview`
- **THEN** 系统返回 preview 输出，而不是限制 preview 只能在 `find_session` 之后使用

#### Scenario: preview 模式不接受模糊目标

- **WHEN** 调用方指定 `mode` 为 `preview` 但仅提供关键词、截断 ID 或其他非完整 session 标识
- **THEN** `read_session` 不将该输入视为可直接读取的目标 session

### Requirement: `read_session` preview 必须使用首尾窗口压缩 transcript

系统 MUST 让 `read_session` 的 `preview` 模式以稳定的首尾窗口渲染 transcript：保留 session 标题与更新时间，保留最早 2 个有效 transcript turns 和最近 3 个有效 transcript turns，并在中间内容被省略时输出稳定的省略标记。有效 transcript turn 指包含普通 user 或 assistant 消息正文的 turn；当首尾窗口重叠时，系统 MUST 去重并按原始时间顺序渲染。

#### Scenario: preview 保留 session 元信息

- **WHEN** `read_session` 生成 preview 输出
- **THEN** 输出包含该 session 的标题和更新时间

#### Scenario: preview 保留开头 turns

- **WHEN** 目标 session 至少包含 2 个有效 transcript turns
- **THEN** preview 输出包含最早 2 个有效 transcript turns 中的 user 与 assistant 消息正文

#### Scenario: preview 保留结尾 turns

- **WHEN** 目标 session 至少包含 3 个有效 transcript turns
- **THEN** preview 输出包含最近 3 个有效 transcript turns 中的 user 与 assistant 消息正文

#### Scenario: preview 去重重叠窗口

- **WHEN** 目标 session 的有效 transcript turns 数量少于或等于首尾窗口总量
- **THEN** preview 输出按原始时间顺序展示这些有效 turns，且不会重复展示同一个 turn

#### Scenario: preview 标注被省略的中间内容

- **WHEN** 目标 session 存在未被首尾窗口覆盖的中间有效 turns
- **THEN** preview 输出包含稳定的省略标记，说明有中间 turns 被省略

### Requirement: `read_session` preview 必须保持证据化而非自由总结

系统 MUST 让 `read_session` 的 `preview` 输出基于 transcript 原文中的 user 与 assistant 消息正文生成；preview 可以省略中间 turns，但不得生成脱离 transcript 证据的自由总结、意图推断或结论改写。preview SHOULD 聚焦消息正文，使 agent 能在短上下文内判断目标 session 是否相关，并在需要更多上下文时继续请求 `full` 模式。

#### Scenario: preview 保留原始消息证据

- **WHEN** preview 输出包含某个有效 transcript turn
- **THEN** 系统保留该 turn 中 user 与 assistant 消息正文的原文片段，而不是用自由总结替代正文

#### Scenario: preview 不包含非消息上下文

- **WHEN** preview 输出包含某个有效 transcript turn
- **THEN** 系统只渲染该 turn 中的 user 与 assistant 消息正文，不渲染工具调用、命令执行、文件读取、文件编辑或 Activity 汇总

#### Scenario: preview 提示可读取完整内容

- **WHEN** `read_session` 返回 preview 输出
- **THEN** 输出包含稳定提示，说明当前结果是删减后的 preview 版本，需要完整上下文时应使用 `full` 模式读取同一完整 session 标识

### Requirement: `read_session` preview 不得包含工具活动与文件活动

系统 MUST 让 `read_session` 的 `preview` 输出只包含 session 元信息、被首尾窗口选中的 user / assistant 消息正文、省略标记和 preview/full 提示。preview 输出不得包含工具调用情况、文件阅读情况、文件编辑情况、命令执行情况、补丁记录、注入 metadata 或 `Activity` section；这些非消息上下文只在完整 context pack 中提供。

#### Scenario: preview 不输出 Activity section

- **WHEN** `read_session` 返回 preview 输出
- **THEN** 输出不包含 `Activity` section 或等价的工具活动汇总区

#### Scenario: preview 不输出工具调用明细

- **WHEN** 被选中的 transcript turn 中存在工具调用、命令执行或工具结果
- **THEN** preview 输出不包含这些工具调用、命令执行或工具结果明细

#### Scenario: preview 不输出文件活动明细

- **WHEN** 被选中的 transcript turn 中存在文件读取、文件编辑或补丁修改活动
- **THEN** preview 输出不包含这些文件活动明细

#### Scenario: full 模式保留非消息上下文

- **WHEN** 调用方需要查看工具活动、文件阅读或文件编辑上下文
- **THEN** 调用方可以使用 `full` 模式读取完整引用上下文包

### Requirement: 显式 session 引用必须继续使用完整上下文包

系统 MUST 保持 `@@<session-id>` 显式引用注入使用完整引用上下文包，不得因为 `read_session` 支持 preview 模式而自动降级为轻量预览。preview 模式仅用于 agent 或调用方显式调用 `read_session` 时的候选判别。

#### Scenario: 显式引用不使用 preview

- **WHEN** 用户消息中包含有效的 `@@<session-id>` 显式引用
- **THEN** 插件层为当前轮附加完整引用上下文包，而不是 preview 输出

#### Scenario: preview 不改变引用加载反馈

- **WHEN** 用户消息中包含有效的 `@@<session-id>` 显式引用
- **THEN** 模型仍按完整引用上下文包的加载提示输出 session 引用加载状态报告

## MODIFIED Requirements

### Requirement: `read_session` 必须返回过滤后的引用上下文包

系统 MUST 让 `read_session` 在默认模式和 `full` 模式下返回基于 transcript 过滤、压缩与格式化后的引用上下文包。该上下文包应默认保留 user 与 assistant 消息正文，并按内容来源压缩 synthetic / tool injection / file read 内容；它的目标是生成可直接阅读、可继续工作的压缩 transcript，而不是机械化 transcript skeleton，也不是面向 agent 的自由总结结果。`preview` 模式不返回完整引用上下文包，只返回按首尾窗口选中的消息正文、必要元信息、省略标记和 preview/full 提示。

#### Scenario: 返回可读压缩 transcript

- **WHEN** `read_session` 在默认模式或 `full` 模式下为指定 session 生成引用上下文
- **THEN** 返回内容以可读的压缩 transcript 为主体，而不是以 message id、字段名和工具事件转储为主体

#### Scenario: 默认保留普通用户消息正文

- **WHEN** transcript 中存在普通用户消息正文，且 `read_session` 在默认模式或 `full` 模式下生成引用上下文包
- **THEN** `read_session` 在引用上下文包中保留该正文，而不是因为模板化、流程化或其他语义分类而整体省略

#### Scenario: 默认保留普通 assistant 消息正文

- **WHEN** transcript 中存在 assistant 消息正文，且 `read_session` 在默认模式或 `full` 模式下生成引用上下文包
- **THEN** `read_session` 在引用上下文包中保留该正文，而不是因为缺少额外语义判断而整体丢弃

#### Scenario: 不将引用上下文退化为自由总结

- **WHEN** `read_session` 在任一输出模式下生成引用上下文结果
- **THEN** 系统不会额外产出脱离 transcript 证据的自由总结，而是基于 transcript 内容进行规则化保留、压缩与重组
