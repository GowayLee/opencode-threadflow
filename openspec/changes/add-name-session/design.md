## Context

当前 threadflow 已有三条 session 搜索/读取链路：`/session-search`（用户查找候选）、`@@<session-id>`（显式引用注入）、`read_session`/`find_session`（agent 读取与搜索）。缺口在于 session 标题长期由模型自动生成，质量不稳定、缺乏检索价值，使 `find_session` 的召回效果受限。

`name_session` 通过引入 `[动作][对象] 主题` 结构化标题协议，提供 slash command（注入命名指导）和 agent tool（调用 `client.session.update()` 执行重命名），让 session 标题成为轻量检索索引层。

本 change 的设计重点是：以最小方式新增命令与工具，复用现有模式（`handoff` 的 `command.execute.before` 注入、`find_session` 的 tool 注册），同时不侵入 `find_session`、`read_session` 和显式引用既有边界。

## Goals / Non-Goals

**Goals:**

- 新增 slash command（`/name-session`），注入标题协议指导、当前 session ID/标题，并接受 `$ARGUMENTS` 用户命名方向输入。
- 新增 agent tool `name_session`，仅重命名当前 session，调用 `client.session.update()` 执行，内部自动获取当前 session ID。
- 建立 `[动作][对象] 主题` 标题协议，通过命令指导 agent 生成符合规范的标题。
- 重命名成功后提醒 agent 建议用户回滚此次重命名对话轮次，减少对任务主线的噪音污染。
- 保持 `name_session` 是纯粹的 session-level primitive，不做工作流或 todo 管理。

**Non-Goals:**

- 不实现标题格式的自动校验或 enforcement（agent 负责遵循协议，tool 不改动传入标题）。
- 不为 `find_session` 增加标题权重匹配（属于后续优化方向）。
- 不支持批量重命名、建议模式（只建议不改）。
- `name_session` tool 不暴漏 `sessionID` 参数：仅重命名当前 session，session ID 由 tool 内部自动获取。
- 不创建 sidecar 存储、todo 数据库或 session graph。
- 不把 `name_session` 介入 `handoff` / `read_session` / `find_session` 的内部流程。
- 不改变任何现有 spec 的 REQUIREMENT。

## Decisions

### Decision 1: 命名 command 采用 `command.execute.before` hook 注入 session 上下文

`/name-session` 命令采用与 `handoff` 相同的 `command.execute.before` 注入模式：在命令执行前注入当前 session ID 和原标题，让 agent 直接获得调用 `name_session` tool 所需的参数参考。

```ts
"command.execute.before": async (command, output) => {
  if (command.command === NAME_SESSION_COMMAND_NAME) {
    const sessionInfo = await getCurrentSessionInfo({ client, directory });
    output.parts.push({
      type: "text",
      text: `当前 session ID: ${sessionInfo.sessionID}\n当前 session 标题: ${sessionInfo.title}`,
      synthetic: true,
    });
  }
}
```

选择该方案的原因：

- 与 `handoff` 的 session ID 注入模式一致（参考 `handoff-session-reference` spec），减少新概念。
- Agent 无需通过间接推断或额外调用获取当前 session ID 和原标题。
- 原标题的注入让 agent 有对比基准，可以在报告中说明"原标题为什么不够好"。
- `command.execute.before` 是插件层控制，agent 不会遗漏注入信息。

备选方案与放弃原因：

- 让 agent 自己发现当前 session ID：当前 OpenCode tool context 没有现成机制暴露 session ID，会导致 agent 盲目猜测或调用额外工具。
- 在 command template 中用占位符替换：增加模板预处理复杂度，且同样依赖 hook 在替换时获取 session 信息。
- 通过 `chat.message` hook 注入：`chat.message` 对全部消息生效，会污染非命名命令的上下文。

### Decision 2: `name_session` tool 不校验标题格式

`name_session` tool 只负责调用 `client.session.update()` 执行重命名，不解析、校验或修改 agent 传入的 `title` 字符串。标题协议的正确遵循由 agent 在生成阶段负责，通过 slash command 的命名指导内容来保证。

选择该方案的原因：

- 格式校验逻辑（如正则匹配 `[动作][对象] 主题`）在 tool 层实现会弱化 agent 的生成责任，且当协议演进时需要同时改 tool 校验器和命令指导。
- `title` 是自由字符串，tool 不应拒绝有效但不完全匹配协议的标题（如用户手动指定或未来协议扩展）。
- 保持 tool 实现最小化：只做 SDK 调用和结果渲染。

备选方案与放弃原因：

- tool 层强制校验并拒绝不符合协议的标题：会增加 tool 与协议耦合，且对于用户手动指定的非协议标题会造成不必要的拒绝。

### Decision 3: `name_session` tool 仅重命名当前 session，不暴露 `sessionID` 参数

```ts
tool({
  description: "Rename the current session with a structured, search-optimized title",
  args: {
    title: tool.schema.string().min(1)
      .describe("New title for the current session"),
  },
  execute: async ({ title }) => {
    const currentSessionID = /* 从 plugin input 或 SDK 获取当前 session ID */;
    await client.session.update({
      path: { sessionID: currentSessionID },
      body: { title },
    });
    // 渲染输出...
  },
})
```

- `title`：唯一参数，必填。最终写入当前 session 的标题文本。
- 当前 session ID 由 tool 内部自动获取，agent 不需要知道或传入该值。

选择该方案的原因：

- 压实原语边界：`name_session` 只做当前 session 重命名，`read_session` 负责读任意历史 session，`find_session` 负责候选搜索。每个原语职责单一，互不重叠。
- `command.execute.before` hook 虽然已注入当前 session ID 和原标题（供 agent 参考），但 tool 不依赖 agent 传回 session ID，减少 agent 调用时的冗余参数和出错可能。
- 简化 tool 接口：只有一个必填 `title` 参数，降低 agent 调用负担。

备选方案与放弃原因：

- 保留 `sessionID` 可选参数支持历史 session 重命名：让 `name_session` 的职责扩散到非当前 session，打破了原语边界。历史 session 如需重命名可由用户通过 OpenCode UI 直接操作或后续单独原语支持。

### Decision 4: tool 输出格式与回滚提醒

成功重命名后返回：

```markdown
## Session Renamed

| Field      | Value                                   |
| ---------- | --------------------------------------- |
| Session ID | `ses_abc123`                            |
| Old title  | 原来的标题                              |
| New title  | [设计][name_session] 标题协议与实现方案 |

Session 标题已更新。

> **建议**: 当前轮对话用于重命名标题，会对本 session 的任务主线造成噪音污染。建议用户在确认标题后回滚（撤销/删除）本次重命名相关的消息轮次，仅保留标题变更结果。
```

选择该方案的原因：

- 新旧标题对比让 agent 可向用户清晰报告变更，无需额外推断。
- 回滚提醒放在 tool output 中，不论 agent 通过 command 还是直接调用 tool 都能看到。
- Markdown 表格结构与现有 `find_session` / `read_session` 输出风格一致。
- `> **建议**` 格式是温和提醒，不强制行为。

备选方案与放弃原因：

- 只在 command template 中提醒回滚：agent 直接调用 tool 不经过 command 时会缺失提醒。
- 回滚提醒作为独立的 tool metadata：用户不可见 metadata，失去实际提醒效果。

### Decision 5: slash command 模板内容与 `$ARGUMENTS` 支持

命令模板（`src/commands/name-session.ts`）注入以下命名指导：

1. **标题格式**：`[动作][对象] 主题`，示例 `[设计][name_session] 标题协议与实现方案`
2. **动作标签集合**（10 个）：`[调研]`、`[探索]`、`[讨论]`、`[设计]`、`[决策]`、`[实现]`、`[调试]`、`[验证]`、`[审查]`、`[交接]`
3. **禁止标签**：不得使用 `[TODO]`、`[意图]`、`[待办]`、`[进行中]`、`[已完成]` 等任务管理标签
4. **对象选取**：选取最有检索价值的模块名、功能名、文件名、子系统名或概念名
5. **主题约束**：8-18 中文字符，表达 session 最终有效产物，保留检索关键词
6. **延后想法处理**：如果 session 核心是延后想法，用「后续」「暂缓」「待验证」等自然词，不用意图标签
7. **`$ARGUMENTS` 用户方向**：用户可通过命令后的附加文本传入命名方向提示（如说明该 session 是"未来实现 todo idea"、"设计讨论"、"调试排查"等），agent MUST 据此调整标题的动作标签、对象选取和主题方向
8. **调用指示**：生成标题后调用 `name_session` tool 完成重命名
9. **回滚提醒**：完成后提醒用户可回滚此次重命名对话轮次

选择该方案的原因：

- 指令在命令模板中声明，agent 在命令上下文中直接看到，不依赖外部训练或猜测。
- 模板格式与 `handoff` 命令一致（Markdown 指令 + `$ARGUMENTS` 占位符）。
- `$ARGUMENTS` 为用户提供轻量命名方向输入通道，无需额外参数设计。
- 指导内容源自设计文档 doc（`docs/opencode-threadflow-name-session-design.md`），保持一致性。

### Decision 6: 文件组织与注册

新增文件：

```
src/commands/name-session.ts         → NAME_SESSION_COMMAND_NAME + nameSessionCommand
src/session-reference/name-session-tool.ts → NAME_SESSION_TOOL_NAME + createNameSessionTool()
```

`plugin.ts` 装配：

```ts
import { NAME_SESSION_COMMAND_NAME, nameSessionCommand } from "./commands/name-session.js";
import { NAME_SESSION_TOOL_NAME, createNameSessionTool } from "./session-reference/name-session-tool.js";

// tool 字典
tool: {
  [READ_SESSION_TOOL_NAME]: createReadSessionTool(...),
  [FIND_SESSION_TOOL_NAME]: createFindSessionTool(...),
  [NAME_SESSION_TOOL_NAME]: createNameSessionTool(...),
},

// config 钩子
config.tools = {
  ...(config.tools ?? {}),
  [READ_SESSION_TOOL_NAME]: true,
  [FIND_SESSION_TOOL_NAME]: true,
  [NAME_SESSION_TOOL_NAME]: true,
};
config.command = {
  ...(config.command ?? {}),
  ...commands,
};

// command.execute.before 钩子
if (command.command === NAME_SESSION_COMMAND_NAME) {
  // 注入当前 session ID 和原标题
}
```

选择该方案的原因：

- 与现有 `handoff`、`read_session`、`find_session` 的注册模式完全一致。
- `plugin.ts` 只做装配和钩子，业务逻辑留在子系统文件中。
- `src/commands/index.ts` 自动聚合新命令。

### Decision 7: 测试策略

新增测试文件：

```
tests/session-reference/name-session/
├── name-session-tool.test.ts        → tool 行为测试
└── name-session-command.test.ts     → command hook 注入测试
```

测试覆盖：

- **Tool 测试**：
  - 传入 `title` → 成功重命名当前 session，输出含新旧标题对比
  - `title` 与当前标题相同 → 不调用 SDK，返回提示
  - SDK `update` 失败 → 返回错误信息
  - 成功输出包含回滚提醒
  - tool 不接受 `sessionID` 参数（仅通过内部自动获取当前 session ID）
  - 不依赖 metadata 承载结果
- **Command 测试**：
  - `command.execute.before` 注入 session ID 和原标题
  - 注入不影响其他命令
- **注册测试**：
  - `plugin.ts` 中 `tool` 字典和 `config.tools` 包含 `name_session`
  - `config.command` 包含 `/name-session`

选择该方案的原因：

- 遵循现有测试目录约定（`tests/session-reference/` 下按子系统分组）。
- Tool 和 command 测试分离，对应 spec 中的独立职责要求。

## Risks / Trade-offs

- [标题协议是否正确遵循依赖 agent 能力] → Command 模板中提供明确的格式要求和正反例，减少 agent 偏离协议的概率。Tool 不做格式拦截以避免工具和行为耦合。
- [重命名对话轮次污染任务主线] → 通过 tool 输出的回滚提醒引导用户清理，不做自动删除或强制行为。
- [当前 session 的获取依赖 SDK 能力] → 从 `ses_23608fe50ffedSlXIkzuLHTB2k` 的调研确认 `client.session.update()` 可用；当前 session ID 的获取方式需在实现中确认（可能通过 hook context 或 SDK 的 session 信息接口）。
- [新旧标题相同时的判定] → 实现时做字符串全等比较，避免不必要的 SDK 调用。

## Migration Plan

本 change 不涉及持久化数据迁移。

实施顺序：

1. 新增 `src/commands/name-session.ts`（命令名 + 模板）。
2. 在 `src/commands/index.ts` 中注册命令。
3. 新增 `src/session-reference/name-session-tool.ts`（tool 定义 + `client.session.update()` 调用 + 输出渲染）。
4. 在 `src/plugin.ts` 中装配 tool 字典、config.tools、config.command 和 `command.execute.before` hook。
5. 编写测试（tool 行为 + command hook）。
6. 运行 `bun run typecheck` 和 `bun test tests`。

回滚策略：

- 从 `plugin.ts` 移除 `name_session` 的 tool 注册、config.tools 开关、command 注册和 hook 分支，不影响其他功能。

## Open Questions

- 当前 session ID 的获取路径：通过 `input.sessionID`（plugin input）、SDK 查询当前 session，还是 hook context 携带？需在实现时确认 OpenCode SDK 暴露方式。当前 session 标题可通过相同路径或 `client.session.get()` 获取。
- `find_session` 标题权重匹配：是否后续变更中为标题匹配增加加权？本 change 不涉及。
