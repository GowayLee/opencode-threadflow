## 1. 命令实现

- [x] 1.1 新增 `src/commands/name-session.ts`，导出 `NAME_SESSION_COMMAND_NAME` 和 `nameSessionCommand` 命令对象
- [x] 1.2 命令模板包含标题协议指导：`[动作][对象] 主题` 格式、10 个动作标签、禁止标签、对象选取原则、主题约束（8-18 字）、延后想法处埋规则、回滚提醒
- [x] 1.3 命令模板使用 `$ARGUMENTS` 占位符接收用户命名方向输入，并引导 agent 据此调整标题生成
- [x] 1.4 在 `src/commands/index.ts` 中导入并注册 `nameSessionCommand`

## 2. `name_session` Tool 实现

- [x] 2.1 新增 `src/session-reference/name-session-tool.ts`
- [x] 2.2 定义 `NAME_SESSION_TOOL_NAME = "name_session"` 和 `createNameSessionTool({ client, directory })`
- [x] 2.3 使用 `tool()` 定义仅 `title` 参数（必填），不暴露 `sessionID` 参数
- [x] 2.4 execute 内部自动获取当前 session ID（通过 plugin input 或 hook context 传递），调用 `client.session.update()` 执行重命名
- [x] 2.5 更新前获取当前 session 原标题，`title` 与原标题全等时跳过 `update()` 调用并返回无需变更提示
- [x] 2.6 成功输出 Markdown 表格：Session ID、Old title、New title 对比
- [x] 2.7 成功输出包含回滚提醒（建议用户撤销重命名对话轮次）
- [x] 2.8 SDK `update()` 失败时返回清晰错误信息（含 session ID 和失败原因）
- [x] 2.9 确保 tool 不写入 tool metadata、不调用 `find_session` / `read_session`、不读取其他 session 的 transcript

## 3. 插件注册与 Hook

- [x] 3.1 在 `src/plugin.ts` 中导入 `createNameSessionTool` 和 `NAME_SESSION_TOOL_NAME`
- [x] 3.2 在 plugin `tool` 字典中注册 `name_session`
- [x] 3.3 在 `config.tools` 中启用 `name_session`
- [x] 3.4 在 `config.command` 中注册 `NAME_SESSION_COMMAND_NAME`
- [x] 3.5 在 `command.execute.before` hook 中新增 `NAME_SESSION_COMMAND_NAME` 判断分支，注入当前 session ID 和原标题（`synthetic: true`），不影响 `handoff` / `session-search` 等现有命令

## 4. 测试覆盖

- [x] 4.1 新增 `tests/session-reference/name-session/` 目录
- [x] 4.2 新增 `tests/session-reference/name-session/name-session-tool.test.ts`
- [x] 4.3 覆盖：传入 `title` → 成功重命名当前 session，输出含旧/新标题对比
- [x] 4.4 覆盖：`title` 与当前标题相同 → 不调用 SDK update，返回无需变更提示
- [x] 4.5 覆盖：SDK `update()` 失败 → 返回错误信息含 session ID
- [x] 4.6 覆盖：成功输出包含回滚提醒
- [x] 4.7 覆盖：tool 仅接受 `title` 参数，不暴露 `sessionID`
- [x] 4.8 覆盖：tool 不依赖 metadata 承载结果
- [x] 4.9 新增 `tests/session-reference/name-session/name-session-command.test.ts`
- [x] 4.10 覆盖：`command.execute.before` 在 `/name-session` 命令下注入 session ID 和原标题
- [x] 4.11 覆盖：注入不影响 `handoff` / `session-search` 等其他命令
- [x] 4.12 覆盖：`plugin.ts` 中 `tool` 字典、`config.tools`、`config.command` 包含 `name_session` 相关注册

## 5. 验证

- [x] 5.1 运行 `bun run typecheck`
- [x] 5.2 运行 `bun test tests`
