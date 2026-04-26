## 1. 搜索核心调整

- [x] 1.1 调整 `src/session-reference/search.ts`，让 `searchSessions()` 或其内部实现支持可配置结果上限
- [x] 1.2 保持 `/session-search` 继续使用 10 条用户侧展示上限
- [x] 1.3 为 `find_session` 提供获取当前搜索窗口内全部匹配结果的调用路径
- [x] 1.4 导出实现 `find_session` 所需的搜索结果类型或稳定辅助函数，避免复制搜索结构定义

## 2. `find_session` Tool 实现

- [x] 2.1 新增 `src/session-reference/find-session-tool.ts`
- [x] 2.2 定义 `FIND_SESSION_TOOL_NAME = "find_session"` 和 `createFindSessionTool()`
- [x] 2.3 使用 `tool()` 定义结构化 `query` 参数，并在 execute 中 trim 输入
- [x] 2.4 空白 query 返回可解释 Markdown，不执行候选召回
- [x] 2.5 调用搜索核心并输出当前搜索窗口内全部匹配结果
- [x] 2.6 将结果渲染为 Markdown 表格，包含 query、scanned window、result count、完整 session ID、label、updatedAt 和 match
- [x] 2.7 有候选结果时在输出中提示 agent 可用完整 session ID 调用 `read_session`
- [x] 2.8 确保 `find_session` 不调用 `read_session`、不生成 context pack、不注入 session reference context、不写入 tool metadata

## 3. 插件注册

- [x] 3.1 在 `src/plugin.ts` 中导入 `createFindSessionTool` 和 `FIND_SESSION_TOOL_NAME`
- [x] 3.2 在 plugin `tool` map 中与 `read_session` 并列注册 `find_session`
- [x] 3.3 在 `config.tools` 中启用 `find_session`
- [x] 3.4 确认 `/session-search` command hook 与 `@@<session-id>` chat hook 行为不变

## 4. 测试覆盖

- [x] 4.1 新增 `tests/session-reference/find-session-tool.test.ts`
- [x] 4.2 覆盖空白 query 返回可解释结果且不执行候选召回
- [x] 4.3 覆盖 title、slug-or-id、transcript 命中时输出完整 session ID 与 match
- [x] 4.4 覆盖无结果时输出 `No matching sessions found.`
- [x] 4.5 覆盖 `find_session` 返回当前搜索窗口内全部匹配结果，而不是固定截断为 10 条
- [x] 4.6 覆盖有结果时输出 `read_session` 后续读取提示
- [x] 4.7 覆盖输出不包含完整 transcript、`# Session Context Pack` 或其他 context pack 内容
- [x] 4.8 覆盖 `find_session` 不依赖 tool metadata 承载搜索结果
- [x] 4.9 更新或补充 `tests/session-reference/search.test.ts`，确保 `/session-search` 仍保留 10 条展示上限

## 5. 验证

- [x] 5.1 运行 `bun run typecheck`
- [x] 5.2 运行 `bun test tests`
- [x] 5.3 运行 `openspec validate add-find-session-tool`
