# opencode-threadflow

OpenCode 的 session 交互增强插件, 让你与越来越多, 越来越乱的 sessoin 们共同生活得更好.

[English README →](./README.md)

## 为什么做这个插件

在使用 Coding Agent 进行开发时, 逐渐增加的 session 数量让我越来越焦虑. 这些带着模型自动命名标题的 session 里包含着了大量想删但又舍不得删的历史任务信息. 留着感觉没用, 但是删了怕以后需要参考...

**我们需要把 session 变为可以紧贴任务流, 灵活调用的上下文包📦**

这个想法首先来自我对 Amp Code thread 设计的观察。Amp Code 围绕 thread 做出了一些很有启发性的交互：handoff、referencing threads、find threads。这些设计把 thread/session 本身变为 AI Coding 工作流里的一等公民。

`opencode-threadflow` 是我试图把这种 thread-first 交互思路带入 OpenCode 的一个插件. 同时它也在 Amp-Code-like thread 交互的基础上, 拓展了一些我对 session 管理/交互的想法与思路.

特别感谢 Amp Code 团队公开分享这些产品思考与功能设计, 这个项目的很多灵感都来自对这些博客的阅读学习:

- [Handoff](https://ampcode.com/news/handoff)
- [Find Threads](https://ampcode.com/news/find-threads)
- [Referencing Threads](https://ampcode.com/manual#referencing-threads)

## Highlights

### Slash Commands

面向用户主动触发的命令，适合在当前 session 中直接发起搜索、交接或命名流程。

#### `/handoff`: 工作交接

通过 `/handoff` 命令从当前 session 生成一份**可编辑的任务交接笔记**，包含：

- 源 session 引用（含 `read_session` 提示）
- 当前任务背景、已确认决策、约束条件和下一步目标
- 建议起步动作与相关文件列表

下一个 session 的 agent 可调用 `read_session` 按需回看源 session 完整上下文。

> Amp Code: 我们鼓励将会话聚焦在一个单任务上...不再总结会话, 而是从中提取对下一个任务重要的内容. (原话有改动)

而且我们也在 [Amp Code Thread Map](https://ampcode.com/news/thread-map) 的基础上迈出了下一步: **[任务流溯源与分叉](#任务流溯源与分叉)**. 在多次跨 session handoff 时自动追踪任务线性链路, 并解析当前 session 派生的并行分叉子会话, 让 agent 接手任务时获得任务流的完整视野.

_该部分的设计与实现参考了 [opencode-handoff 插件](https://github.com/joshuadavidthomas/opencode-handoff), 感谢[@Thosmas](https://github.com/joshuadavidthomas)的贡献, 为我提供了极大的帮助_

#### `/resume-work`: 恢复近期工作上下文

通过 `/resume-work` 一键加载最近 5 个非归档 session 的完整 context pack 到当前 session。零参数——插件基于纯时间局部性自动发现近期 session，并在命令模板执行前注入完整上下文。

Agent 会扫描注入的 context pack，总结近期工作状态（关键决策、当前进展、未解决问题），并表明已准备好从上次中断的地方继续推进。

_底层实现是对已有原语的薄层组合：`find_session`（空 query → 近期 session）+ `read_session`（full 模式）。_

#### `/search-session`: session 搜索

通过 `/search-session <关键词>` 查找候选 session，agent 将以 Markdown 表格输出可复制的完整 session ID。支持空格分隔的多关键词查询，并按匹配质量排序。

适合用户先手动定位历史 session，再把目标 ID 用在 `@@ses_...` 引用、handoff note 或后续提示词中。

_由于 opencode 似乎没有开放直接把插件输出显示在对话UI中的能力, 所以该功能只能通过 agent 复述插件输出的方式来实现, 确实有点不太优雅._

#### `/name-session`: 更好的会话命名方式

通过 `/name-session` 让 Agent 基于当前 session 内容与预定义的规则生成一个结构化标题，并调用 `name_session` tool 完成重命名。

标题协议采用 `[动作][对象] 主题` 形式，目标是让历史 session 在列表、搜索结果和 handoff 链路中更容易被再次发现。

> 为什么不去修改内置 Title 生成 Agent 的提示词, 而是新增一个用户命令? 会话中的任务内容重心随着会话的推进而变化, 仅仅在会话开始时生成一个固定标题的做法不够灵活!

### 显式 Session 引用 (`@@ses_...`)

在消息中使用 `@@ses_<id>` 语法即可显式引用历史 session。插件会：

- 解析引用、读取对应 session、将完整 context pack 静默注入当前轮上下文
- 要求模型在回复开头输出简短的引用加载状态报告
- 支持同时引用多个 session，自动去重
- 对无效引用在报告中说明失败原因

### Agent Tools

面向 Agent 工作流调用的工具，负责候选发现、精确读取和当前 session 命名。

#### `find_session`: Agent 根据多关键词自主搜索历史 session

Agent 可调用 `find_session` tool 搜索最近的非归档 session。与 `/search-session` 共用同一套搜索语义（优先级：title → slug/sessionID → transcript 采样），只将候选 ID 返回给 Agent，不自动注入上下文。

#### `read_session`: 分层 session 读取

接受完整 `ses_...` 标识，提供两种输出模式：

| 模式           | 用途           | 内容                                                                     |
| -------------- | -------------- | ------------------------------------------------------------------------ |
| `full`（默认） | 获取完整上下文 | 可读的压缩 transcript + 活动汇总 + 文件/命令/补丁活动记录                |
| `preview`      | 快速候选判别   | session 元信息 + 最早 2 个有效对话轮次 + 最近 3 个有效对话轮次的消息正文 |

`read_session` 只接受完整 session ID，输出的 context pack 基于纯代码规则压缩(不依赖 Agent 自由总结)。

#### `name_session`: 重命名当前 session

只作用于当前 session，接受结构化标题并调用 OpenCode API 完成重命名。常由 `/name-session` 命令驱动，未来也可以设计逻辑由 Agent 在明确需要整理当前 session 标题时直接调用。

## 安装

在 OpenCode 配置文件（`~/.config/opencode/opencode.json` 或项目根目录的 `opencode.json`）中添加 `plugin` 字段：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-threadflow"]
}
```

配置 `locale` 选项, 切换语言偏好

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [["opencode-threadflow", { "locale": "zh" }]]
}
```

`locale` 可选值为 `"zh"`（简体中文）或 `"en"`（英文），默认 `"en"`。

如需本地开发调试，将插件放入 `~/.config/opencode/plugins/`（全局）或 `.opencode/plugins/`（项目级）即可。

## 使用示例

### `/handoff` — 工作交接

`/handoff <下一个会话中的任务目标>`

```
/handoff 下一步我们将继续完成 session 引用功能的测试用例
```

Agent 会生成一份可编辑的 handoff note

用户在发送前可自由编辑 note，复制到新 session 后即可继续工作。新会话中的 agent 会先阅读 note 中的上下文信息, 查看推荐阅读的相关文件，如果需要更多细节则会调用 `read_session` 回看源 session。

### `/resume-work` — 恢复近期工作上下文

```
/resume-work
```

插件自动发现最近 5 个非归档 session（通过 `find_session` 空 query），加载每个 session 的完整 context pack（通过 `read_session` full 模式），并以 synthetic text 形式注入当前轮。

Agent 随后会：

- 浏览各 session 标题建立全局印象
- 从相关 session 的对话历史中提取关键决策和进展
- 按工作线或主题合并总结近期工作状态，而非逐个 session 罗列
- 表明已准备好从上次中断的地方继续推进

边界情况：

- 如果当前 session 之外没有近期非归档 session，agent 直接说明未找到近期工作上下文并愿意协助当前请求。
- 如果部分 session 加载失败，静默跳过并在注入块中标注。

### 任务流溯源与分叉

> Amp Code 介绍了他们[对 Thread Map 的观察](https://ampcode.com/news/thread-map). What's Next? This is my next step ~

多次跨 session 使用 handoff 时，插件自动追踪**任务线性上游链路**（source-chain）并解析当前 session **前序分叉子会话**（predecessor child sessions），形成任务流视图, 帮助 Agent 在新会话推进任务时有更多机会与渠道了解该任务在历史 session 中的演进历史与上下文.

**线性溯源：`[handoff-source-chain]:`**

每个 handoff note 第一行记录完整的上游链路：

```
[handoff-source-chain]: ses_AAA 实现用户认证; ses_BBB 修复token刷新; ses_CCC 添加OAuth
```

用户将 note 复制到新 session 后，新 session 中的下一次 handoff 会自动读取这个会话开头的 `[handoff-source-chain]` 并继续构建任务流链路视图：

```
`ses_AAA` 实现用户认证 → `ses_BBB` 修复token刷新 → `ses_CCC` 添加OAuth
```

这形成了按时间排列的任务流主干，让新 session 中的 agent 理解"当前任务如何逐步到达当前状态"。

**分叉(Hub and Spokes)：前序子 session 解析**

在一个 session 中可能会产生多个子任务, 进而我们会使用多次 handoff(依次编号 `hdfCCC-1`、`hdfCCC-2`...),每次 handoff 都会被不同的子 session 接走执行。系统在生成新 handoff 时会：

1. 扫描当前 session 中所有历史 `[handoff-id]:`
2. 跨所有未归档 session 查找启动消息中匹配这些 handoff-id 的子 session
3. 将结果分为三类：**已解析**（恰好一个 child）、**未解析**（未找到）、**歧义**（多个 child 共享同一 handoff-id）

解析成功时，marker block 和 `### 任务流` 章节会同时呈现线性链路和分叉节点：

```markdown
[handoff-source-chain]: ses_AAA 实现认证; ses_CCC 添加OAuth
[handoff-id]: hdfCCC-3
[handoff-predecessor-sessions]: ses_CHILD1 via hdfCCC-1; ses_CHILD2 via hdfCCC-2

### 任务流

上游链路：
`ses_AAA` 实现认证 → `ses_CCC` 添加OAuth

前序子会话（从本 session 之前的 handoff note 出发）：

- `ses_CHILD1` — 修复了 OAuth scope 配置问题
- `ses_CHILD2` — 完成了集成测试框架搭建

以上 session 均可通过 `read_session` 回看完整上下文。
```

接手方由此获得任务流的完整视野：线性上游（怎么来的）+ 并行分支（还派生了哪些方向）。所有前序子 session id 作为 `read_session` 工具调用参考。

### `/search-session` — 搜索历史 session

```
/search-session database refactoring
```

Agent 会原样输出搜索结果表格：

| Session ID      | 标签                                | 更新时间                 | 匹配位置 |
| --------------- | ----------------------------------- | ------------------------ | -------- |
| `ses_abc123...` | [实现][database] 迁移至新的查询引擎 | 2026-04-15T06:30:00.000Z | title    |
| `ses_def456...` | [讨论][database] 数据库重构方案评估 | 2026-04-10T03:00:00.000Z | title    |

找到目标 session ID 后，可通过 `@@ses_...` 在消息中引用，或在 handoff note 中作为源 session 标注。

### `@@ses_...` — 显式引用历史 session

在任意消息中使用 `@@ses_<id>` 语法引入历史 session 的完整上下文：

```
@@ses_abc123 请回顾之前关于数据库重构的决策，帮我继续完成迁移。
```

Agent 回复开头会输出简短的加载报告：

```
- `ses_abc123` [实现][database] 迁移至新的查询引擎 — loaded
```

之后 agent 继续处理你的请求，在相关时自动使用已加载的 session 内容作为参考。支持一条消息中引用多个 session，自动去重；无效引用会在报告中说明失败原因。

### `/name-session` — 结构化重命名

```
/name-session
```

Agent 会分析当前 session 内容，按 `[动作][对象] 主题` 协议生成结构化标题并完成重命名。完成后返回变更结果：

| Field      | Value                                                |
| ---------- | ---------------------------------------------------- |
| Session ID | `ses_abc123`                                         |
| Old title  | Fix the bug                                          |
| New title  | [实现][handoff] source-chain marker 解析与注入格式化 |

> 完成后会提醒你回滚重命名对话轮次，以保持 session 任务主线干净。

也可直接给出命名方向提示：

```
/name-session 这是关于 handoff source-chain 的实现
```

## 开发

```bash
bun install          # 安装依赖
bun run typecheck    # TypeScript 类型检查
bun test tests       # 运行测试
```

## 致谢

- [Linux DO](https://linux.do/) - 本项目的大量灵感来自这个非常哇塞的技术社区, 等待 Agent 干活的时候刷一刷L站别提多滋润~
- [Amp Code](https://ampcode.com) - 一个很有想法的 Coding Agent(s) 产品, 衷心祝愿祝他们成功 :)
- [opencode-handoff](https://github.com/joshuadavidthomas/opencode-handoff) - 给予我们 handoff 功能形态的灵感

## 许可证

MIT © Hauryn Lee

---

opencode-threadflow is not built by, or affiliated with, the OpenCode team.

OpenCode is ©2026 Anomaly.
