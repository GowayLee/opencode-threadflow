## Purpose

Define the session-discovery-tool capability so agents can search recent sessions for concrete candidates before reading a specific session with `read_session`.

## Requirements

### Requirement: Agent 必须能够通过 `find_session` 搜索候选 session

系统 SHALL 提供一个 agent 可调用的 `find_session` tool，使 agent 能够使用关键词搜索最近的非归档 session，并获得可用于后续精确读取的候选 session 标识。

#### Scenario: Agent 使用关键词搜索 session

- **WHEN** agent 调用 `find_session` 并提供非空关键词
- **THEN** 系统返回与该关键词相关的候选 session 列表，且每个候选项包含完整 session ID

#### Scenario: 空关键词不执行候选搜索

- **WHEN** agent 调用 `find_session` 时提供空字符串或只包含空白字符的关键词
- **THEN** 系统不会执行模糊候选召回，并返回可解释的空查询结果

### Requirement: `find_session` 必须复用现有 session 搜索语义

系统 MUST 让 `find_session` 与用户侧 `/session-search` 使用同一套 session 搜索语义，包括扫描最近非归档 session、优先匹配 title、其次匹配 slug 或 session ID、最后使用有限 transcript 样本作为补充召回。该搜索语义 MUST 支持单关键词与空格分隔的多关键词查询，并在多关键词查询中按匹配质量确定候选排序。

#### Scenario: 元信息优先匹配

- **WHEN** `find_session` 的查询命中 session title、slug 或 session ID
- **THEN** 系统优先基于这些元信息返回候选结果，而不是先读取完整 transcript

#### Scenario: transcript 样本补充召回

- **WHEN** 当前搜索窗口中存在未被元信息命中但被有限 transcript 样本命中的候选 session
- **THEN** 系统 MAY 读取候选 session 的有限 transcript 样本做补充关键词匹配

#### Scenario: 空格分隔的多关键词查询召回候选 session

- **WHEN** `find_session` 或 `/session-search` 接收包含多个以空格分隔的非空关键词的查询
- **THEN** 系统使用同一套搜索核心匹配这些关键词，并返回命中至少一个有效关键词的候选 session

#### Scenario: 完整查询短语优先于部分关键词命中

- **WHEN** 一个 session 命中完整归一化查询短语，另一个 session 只命中其中部分关键词
- **THEN** 系统将完整短语命中的候选排序在同一 match bucket 内更靠前

#### Scenario: 多关键词匹配质量影响排序

- **WHEN** 多个 session 匹配同一多关键词查询但命中的关键词数量或匹配质量不同
- **THEN** 系统在稳定 match bucket 基础上优先返回匹配质量更高的候选，再按更新时间倒序排序

#### Scenario: 搜索结果保持确定性排序

- **WHEN** 多个 session 对同一查询具有相同的 match bucket 与匹配质量
- **THEN** 系统按更新时间倒序和稳定 tie-breaker 返回结果，避免依赖模型自由排序

### Requirement: `find_session` 必须返回候选结果而不是上下文包

系统 MUST 将 `find_session` 的职责限定为候选 session 查找；该工具不得读取完整 session transcript、不得生成 `read_session` context pack、不得把搜索结果自动注入当前轮上下文。

#### Scenario: 搜索结果不包含完整 transcript

- **WHEN** agent 调用 `find_session` 搜索历史 session
- **THEN** 返回结果只包含候选识别与展示所需的信息，而不包含完整 transcript 或 context pack

#### Scenario: 搜索不会自动读取候选 session

- **WHEN** `find_session` 返回一个或多个候选 session
- **THEN** 系统不会自动对这些候选调用 `read_session`

#### Scenario: 搜索不会自动注入引用上下文

- **WHEN** `find_session` 返回候选 session
- **THEN** 系统不会因为该搜索结果自动向当前轮附加 session 引用上下文

### Requirement: `find_session` 输出必须支持后续精确读取

系统 SHALL 让 `find_session` 以单页 Markdown 输出足够稳定的信息，使 agent 能够基于候选结果选择明确的 session ID，并在需要完整上下文时再调用 `read_session`。系统 MUST 返回当前搜索窗口内的全部匹配结果，而不是固定截断为 10 条；系统 MUST NOT 为第一版 `find_session` 引入分页参数、JSON 双协议或依赖 tool metadata 的结果通道。

#### Scenario: 候选结果包含完整 session ID

- **WHEN** `find_session` 返回候选 session
- **THEN** 每个候选项都包含完整 `ses_...` 标识，而不是截断 ID、别名或不可直接读取的展示值

#### Scenario: 候选结果包含匹配来源

- **WHEN** `find_session` 返回候选 session
- **THEN** 每个候选项都标明其匹配来源，例如 title、slug-or-id 或 transcript

#### Scenario: 候选结果包含可读标签和更新时间

- **WHEN** `find_session` 返回候选 session
- **THEN** 每个候选项都包含可读标签和更新时间，以帮助 agent 判断候选是否可能相关

#### Scenario: 搜索结果以单页 Markdown 全量返回

- **WHEN** `find_session` 返回候选 session
- **THEN** 系统以单页 Markdown 格式返回当前搜索窗口内的全部匹配结果，而不是固定截断为 10 条或要求 agent 通过分页参数继续翻页

#### Scenario: 搜索结果提示后续读取方式

- **WHEN** `find_session` 返回一个或多个候选 session
- **THEN** 输出中显式提示 agent 可使用完整 session ID 调用 `read_session` 读取具体内容

#### Scenario: 搜索结果不依赖 metadata

- **WHEN** `find_session` 返回搜索结果
- **THEN** agent 可仅通过 tool output 理解全部候选信息，而不依赖 OpenCode tool metadata

### Requirement: `find_session` 必须作为独立 agent tool 注册

系统 MUST 将 `find_session` 作为独立 tool 暴露给 agent，并通过结构化参数接收搜索关键词；该工具不得通过复用 slash command 模板或模拟 `/session-search` 命令来实现 agent 调用入口。

#### Scenario: Agent 通过工具接口调用搜索

- **WHEN** agent 需要查找历史 session 候选
- **THEN** agent 能够调用 `find_session` tool 并传入结构化 `query` 参数

#### Scenario: Tool 注册不依赖 slash command 执行

- **WHEN** agent 调用 `find_session`
- **THEN** 系统通过 tool execute 逻辑完成搜索，而不是触发 `/session-search` 的 command hook
