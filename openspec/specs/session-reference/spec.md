## Purpose

Define the session-reference capability so users can explicitly locate and reuse context from an existing session inside the current session.

## Requirements

### Requirement: 用户必须通过显式搜索流程定位可引用 session

系统 SHALL 提供一个独立于消息输入框实时补全的 session 搜索流程，使用户能够先查找候选 session，再决定是否在当前消息中引用它。

#### Scenario: 通过 slash command 搜索 session

- **WHEN** 用户执行 `/session-search <关键词>`
- **THEN** 系统返回与关键词相关的 session 候选列表，且列表中包含可供用户复制的完整 session 标识

#### Scenario: 搜索流程不依赖输入框实时推荐

- **WHEN** 用户准备在消息中引用历史 session
- **THEN** 系统不要求输入框提供实时搜索、内联补全或候选弹窗，用户仍可通过独立搜索命令完成引用前定位

### Requirement: 用户必须通过 `@@<session-id>` 显式引用历史 session

系统 MUST 将 `@@<session-id>` 定义为用户显式引用历史 session 的语法，并仅在用户消息中出现该显式语法时触发对应 session 的引用处理。

#### Scenario: 用户在消息中显式引用 session

- **WHEN** 用户提交包含 `@@<session-id>` 的消息
- **THEN** 系统将该片段识别为一次显式 session 引用动作, 如果有多个`@@<session-id>`则对每一个都进行 session 引用

#### Scenario: 未显式引用时不自动召回历史 session

- **WHEN** 用户消息中不包含 `@@<session-id>`
- **THEN** 系统不会基于历史相关性、自动记忆或无感召回机制主动读取旧 session 并注入其上下文

### Requirement: `@@<session-id>` 的解析与引用处理必须由插件层执行

系统 MUST 在消息提交后的插件处理链路中解析 `@@<session-id>` 并执行引用动作，而不是将是否读取该 session 的决定交给 agent 自行判断。

#### Scenario: 插件层处理显式引用

- **WHEN** 用户提交包含 `@@<session-id>` 的消息
- **THEN** 插件层负责解析引用、触发对应读取流程，并为当前轮准备要附加的引用上下文

#### Scenario: agent 不负责决定是否读取显式引用

- **WHEN** 消息中已经包含有效的 `@@<session-id>` 引用
- **THEN** agent 不需要再自行判断是否应该读取该 session，该引用读取动作已经由插件层确定

### Requirement: 显式引用的 session 上下文必须附加到当前轮上下文中

系统 SHALL 在识别到有效的 `@@<session-id>` 后，把对应 session 的引用上下文包附加到当前轮上下文中，使 agent 在处理本轮请求时能够直接使用该引用内容。加载反馈通过 context pack 末尾的提示词引导模型主动输出，与上下文包共用同一 `noReply` 注入通道。提示词 SHALL 将已加载 session 定义为当前请求的参考材料，而不是新的独立任务。

#### Scenario: 有效引用附加上下文包

- **WHEN** 用户消息中包含一个可解析且存在的 `@@<session-id>`
- **THEN** 系统在当前轮发送给 agent 的上下文中附加该 session 的引用上下文包

#### Scenario: 无效引用不应静默伪造上下文

- **WHEN** 用户消息中包含无法解析或不存在的 `@@<session-id>`
- **THEN** 系统不会附加伪造的 session 上下文，并通过 model-prompt 引导模型在回复中告知用户该引用未能成功解析及其具体原因

### Requirement: `read_session` 只接受完整指定的 session 标识

系统 MUST 将 `read_session` 的输入边界限定为完整指定的 session 标识，不得让该工具承担模糊搜索、候选召回或关键词匹配职责。

#### Scenario: 使用完整 session 标识读取引用上下文

- **WHEN** 插件层或 agent 使用完整 session 标识调用 `read_session`
- **THEN** `read_session` 返回该指定 session 的引用上下文结果

#### Scenario: 不支持模糊搜索式读取

- **WHEN** 调用方仅提供关键词、截断 ID 或其他非完整 session 标识
- **THEN** `read_session` 不将该输入视为可直接读取的目标 session

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

### Requirement: `read_session` 的 turn 渲染必须同时保留 assistant 消息与工具活动

系统 MUST 在默认 transcript turn 中同时保留 assistant 的正文消息与该 turn 内发生的工具活动，包括文件读取、命令执行、补丁修改以及相关注入内容的压缩表示；系统不得把 turn 渲染退化为只保留 user / assistant 文本，或把工具活动完全移到独立汇总区。

#### Scenario: turn 中保留 assistant 工具活动

- **WHEN** 某个 transcript turn 内包含 assistant message 以及对应的工具调用或文件修改活动
- **THEN** `read_session` 在该 turn 的默认渲染中同时保留 assistant 正文与这些工具活动的压缩表示，而不是只保留 assistant 文本

#### Scenario: Activity section 不替代 turn 内过程记录

- **WHEN** `read_session` 生成默认 context pack
- **THEN** `Activity` section 作为跨 turn 汇总视图存在，但不会替代 transcript turn 内对 assistant 工具活动的记录

### Requirement: `read_session` 必须按来源规则压缩 synthetic 与 file read 注入内容

系统 MUST 按内容来源而不是按语义价值处理注入内容：模板式注入消息按普通消息保留，synthetic 文本统一按长度截断，用户显式引入的 file read 内容保留正文片段并按长度截断，不得仅退化为文件名或引用提示。默认预算上，普通 user / assistant 消息正文不设长度上限；synthetic 文本与工具注入正文统一按 300 字符预算截断。

#### Scenario: 模板式注入消息按普通消息保留

- **WHEN** transcript 中存在由命令或工作流注入的模板式消息正文
- **THEN** `read_session` 将其按普通消息正文保留，而不是因为其呈现为模板内容就单独降级为占位符

#### Scenario: synthetic 文本统一按长度截断

- **WHEN** transcript 中存在 synthetic 文本内容
- **THEN** `read_session` 对该内容执行统一的长度截断，并保留其作为 synthetic 内容被压缩后的正文表示

#### Scenario: file read 注入保留内容本体

- **WHEN** transcript 中存在用户显式引入的 file read 注入内容
- **THEN** `read_session` 在引用上下文包中保留该文件内容的正文片段并按长度截断，而不是只输出文件路径、文件名或“引用了文件”这类替代描述

#### Scenario: synthetic 与工具注入使用统一 300 字符预算

- **WHEN** transcript 中存在 synthetic 文本或工具注入的正文型内容
- **THEN** `read_session` 对这些内容应用统一的 300 字符截断预算，并在超出预算时保留稳定的截断标记

### Requirement: `read_session` 应使用固定语义短语渲染提炼后的工具活动

系统 MUST 在默认 context pack 中使用固定、可预测的语义短语连接被提炼出的工具活动与操作对象，例如“read xxx files”“executed xxx commands”“patched xxx files”这类稳定表达，以替代机械化字段名和逐项 key-value 转储；该渲染方式 MUST 基于纯代码规则，不得依赖自由语义分析。

默认渲染结构 SHOULD 保留按活动类型分组的子小节，例如 `Read`、`Commands`、`Patches`；各子小节内部再使用固定语义短语列出对应活动，并将文件路径、命令文本等对象明细按逐行列表输出，而不是默认压在同一行内联展示。

#### Scenario: 使用固定短语汇总文件读取活动

- **WHEN** `read_session` 渲染提炼后的文件读取活动
- **THEN** 系统使用类似“read xxx files”的固定短语呈现读取结果，而不是输出 `filePath=`、`loaded=` 或等价机械字段作为主体

#### Scenario: 使用固定短语汇总命令执行活动

- **WHEN** `read_session` 渲染提炼后的命令执行活动
- **THEN** 系统使用类似“executed xxx commands”的固定短语呈现命令活动，而不是输出 `command=`、`workdir=`、`exit=` 或等价机械字段作为主体

#### Scenario: 使用固定短语汇总补丁活动

- **WHEN** `read_session` 渲染提炼后的文件修改活动
- **THEN** 系统使用类似“patched xxx files”的固定短语呈现补丁活动，而不是以 patch 事件字段或 message 内部元信息作为主体

#### Scenario: Activity 保留按类型分组的子小节

- **WHEN** `read_session` 渲染默认 Activity section
- **THEN** 系统按 `Read`、`Commands`、`Patches` 或等价稳定类型对子活动分组，而不是把所有活动混成单一未分组列表

#### Scenario: 文件与命令明细按多行列表输出

- **WHEN** `read_session` 在 `Read` 或 `Commands` 子小节中渲染文件路径或命令文本明细
- **THEN** 系统将这些对象明细按逐行列表输出，以保持长路径和长命令的可读性，而不是将多项明细内联压缩到同一行

### Requirement: `read_session` 必须显式标注 synthetic 来源并保留多行内容的可读换行

系统 MUST 在 transcript 渲染中显式标注 synthetic 内容来源，例如 `User (synthetic)`、`Assistant (synthetic)` 或等价稳定标签；对于 file read 注入和其他需要保留正文片段的多行内容，系统 MUST 保留原始换行的可读结构，而不是默认压平成单行预览。

#### Scenario: transcript 显式标注 synthetic 来源

- **WHEN** transcript 中存在 synthetic user 或 assistant 内容
- **THEN** `read_session` 在默认 transcript 中显式显示其 synthetic 来源，而不是只通过外围说明或截断标记间接体现

#### Scenario: file read 注入保留多行可读结构

- **WHEN** file read 注入内容本身包含代码块、列表或其他多行结构
- **THEN** `read_session` 在保留正文片段时保留其原始换行与基本可读结构，而不是统一做 whitespace collapse 后渲染为单行文本

### Requirement: `read_session` 默认输出不得包含低价值机械化字段

系统 MUST 让默认 context pack 输出避免暴露对继续工作没有直接帮助的机械化元信息，例如 message id、parent id、User Flags、Step Finish、Pack Coverage、纯调试导向的 omission policy 文本以及其他仅面向实现调试的字段；默认输出 SHOULD 优先用固定语义短语替代这些字段在阅读层面的连接作用。

#### Scenario: 默认输出不暴露 message id

- **WHEN** `read_session` 生成默认引用上下文包
- **THEN** 输出不会以 message id 或 parent id 作为正文主体的一部分

#### Scenario: 默认输出不暴露调试型流程字段

- **WHEN** `read_session` 生成默认引用上下文包
- **THEN** 输出不会包含 `User Flags`、`Step Finish`、`Pack Coverage` 这类仅用于内部流程或覆盖率说明的字段

#### Scenario: 默认输出不暴露实现者视角策略文本

- **WHEN** `read_session` 生成默认引用上下文包
- **THEN** 输出不会包含仅用于说明内部压缩实现策略的低价值字段，例如纯调试导向的 omission policy 或等价描述

### Requirement: session 引用能力必须与 handoff 分层清晰

系统 MUST 将 session 引用定义为“在当前 session 中显式复用一个已存在的历史 session”的能力，并保持其与面向新 session 工作承接的 handoff 能力分层清晰。

#### Scenario: session 引用不替代 handoff

- **WHEN** 用户在当前 session 中使用 `@@<session-id>` 引用历史 session
- **THEN** 系统将其视为当前会话内的显式上下文复用，而不是创建 handoff draft 或启动新 session

#### Scenario: handoff 线索不会自动触发 session 引用

- **WHEN** handoff draft 中提及某个历史 session 线索但当前消息未使用 `@@<session-id>`
- **THEN** 系统不会仅因 handoff 相关内容存在就自动执行 session 引用注入

### Requirement: session 引用能力必须适配 TUI 与 WebUI

系统 MUST 将 session 引用的核心流程定义为“搜索命令 + 显式引用语法 + 插件层上下文附加”，以保证该能力在 TUI 与 WebUI 中均可成立。

#### Scenario: 在 TUI 中完成通用引用流程

- **WHEN** 用户在 TUI 中先执行 `/session-search <关键词>` 再提交包含 `@@<session-id>` 的消息
- **THEN** 系统能够完成 session 定位、引用解析与上下文附加，而不依赖额外的输入框专属交互

#### Scenario: 在 WebUI 中完成通用引用流程

- **WHEN** 用户在 WebUI 中先执行 `/session-search <关键词>` 再提交包含 `@@<session-id>` 的消息
- **THEN** 系统能够完成与 TUI 一致的 session 定位、引用解析与上下文附加流程

### Requirement: 显式 session 引用 MUST 通过模型 report 向用户提供可确认的加载反馈

系统 MUST 在注入给模型的 context pack 末尾附加提示词，要求模型在回复开头输出简短的 session 引用加载状态报告。报告 MUST 覆盖所有引用的处理结果——成功的引用附带 session ID 与 title，失败的引用附带原因。模型 MUST NOT 只输出加载状态报告；报告完成后 MUST 继续处理用户当前请求，并在相关时把已加载 session 内容作为参考材料使用。

#### Scenario: 单引用成功时模型报告确认信息

- **WHEN** 用户消息中包含一个可解析且存在的 `@@<session-id>`
- **THEN** 模型在回复首段输出加载报告，包含该 session 的 ID 与 title

#### Scenario: 多引用成功时模型汇总所有已加载 session

- **WHEN** 用户消息中包含多个可解析且存在的 `@@<session-id>`
- **THEN** 模型在回复首段输出汇总报告，列出每个已加载 session 的 ID 与 title

#### Scenario: 无效引用在报告中显示错误原因

- **WHEN** 用户消息中包含格式错误或对应 session 不存在的 `@@<session-id>`
- **THEN** 模型在加载报告中列出该引用来源及其失败原因，与成功结果一并展示

#### Scenario: 成功与失败引用混合时在同一报告中汇总

- **WHEN** 用户消息中同时包含可加载和不可加载的 `@@<session-id>` 引用
- **THEN** 模型在加载报告中按统一结构列出所有引用的处理结果，成功项附带 session ID 与 title，失败项附带原因

#### Scenario: 无显式引用时不注入提示词

- **WHEN** 用户消息中不包含任何 `@@<session-id>` 引用
- **THEN** 系统不会追加 model-prompt 指令 part

#### Scenario: 加载报告不应吞掉用户原始请求

- **WHEN** 用户消息中包含 `@@<session-id>` 引用并同时提出任意任务请求
- **THEN** 模型先输出简短加载报告，然后继续按用户原始请求完成任务，不把加载报告作为唯一响应内容

### Requirement: Agent 搜索工具不得改变显式 session 引用边界

系统 MUST 允许 agent 通过 `find_session` 查找候选 session，但该搜索动作不得改变 `@@<session-id>` 显式引用、插件层引用处理、以及当前轮上下文附加的既有边界。

#### Scenario: Agent 搜索不触发显式引用注入

- **WHEN** agent 调用 `find_session` 并获得候选 session
- **THEN** 系统不会将这些候选视为用户提交的 `@@<session-id>` 显式引用，也不会自动附加对应 session 上下文

#### Scenario: 用户显式引用仍由插件层处理

- **WHEN** 用户消息中包含 `@@<session-id>`
- **THEN** 系统仍由插件层解析并处理该显式引用，而不是要求 agent 先调用或补调 `find_session`

#### Scenario: Agent 搜索不替代用户侧搜索命令

- **WHEN** 用户准备手动定位可引用 session
- **THEN** 用户仍可使用 `/session-search <关键词>` 完成候选查找，而不要求通过 agent 调用 `find_session`

### Requirement: `find_session` 与 `read_session` 必须保持职责分离

系统 MUST 保持 `find_session` 和 `read_session` 的工具职责分离：`find_session` 负责关键词候选搜索，`read_session` 负责基于完整 session ID 返回引用上下文包。

#### Scenario: 关键词搜索使用 `find_session`

- **WHEN** agent 只有关键词、标题线索或不完整 session 线索
- **THEN** agent 可调用 `find_session` 获取候选 session ID

#### Scenario: 完整上下文读取使用 `read_session`

- **WHEN** agent 已经确定完整 session ID 并需要读取其上下文
- **THEN** agent 使用 `read_session` 读取该指定 session 的 context pack

#### Scenario: `read_session` 不承担候选搜索职责

- **WHEN** agent 向 `read_session` 提供关键词、截断 ID 或其他非完整 session 标识
- **THEN** `read_session` 仍不会将该输入视为可搜索线索或候选召回请求
