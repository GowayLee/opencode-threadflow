## 1. `read_session` 参数与分发

- [x] 1.1 扩展 `src/session-reference/read-session-tool.ts` 的 tool schema，新增可选 `mode` 参数，取值限定为 `full` 或 `preview`
- [x] 1.2 保持未传 `mode` 时默认走 `full`，继续调用现有完整 context pack 路径
- [x] 1.3 保持完整 `ses_...` ID 校验先于模式分发执行，确保 `preview` 不接受关键词、截断 ID 或模糊标识
- [x] 1.4 在 tool metadata 或内部分发中区分 preview/full 调用，但不改变 `@@ses_...` 显式引用注入路径

## 2. Preview 构建与渲染

- [x] 2.1 在 `src/session-reference/refinement.ts` 新增 preview 构建函数，复用 session/messages 读取、`normalizeTranscript()` 和 `assembleTurns()`
- [x] 2.2 实现有效 turn 提取：只从普通 user / assistant text message 中生成 preview 内容，忽略 tool、patch、file、reasoning、step-finish、other 和 metadata
- [x] 2.3 实现首尾窗口选择：保留最早 2 个有效 turns 与最近 3 个有效 turns，窗口重叠时去重并保持原始 turn 顺序
- [x] 2.4 在存在未选中中间有效 turns 时输出稳定省略标记，说明 preview 省略了中间 turns
- [x] 2.5 实现 preview renderer，输出 `# Session Context Preview`、session 元信息、`## Transcript Preview` 和 `## Preview Notice`
- [x] 2.6 确保 preview 输出不包含 `## Activity`、`## Compressed Content`、Assistant Activity、工具调用、命令执行、文件读取、文件编辑、patch 记录或注入 metadata
- [x] 2.7 确保 preview notice 明确说明当前内容是删减 preview 版本，并提示可用同一完整 session ID 与 `mode: "full"` 获取完整上下文

## 3. `find_session` 提示更新

- [x] 3.1 更新 `src/session-reference/find-session-tool.ts` 的 tool description，说明候选搜索后可用 `read_session` preview 快速查看具体消息内容，再按需使用 full
- [x] 3.2 更新 `find_session` 有结果时的 footer，提示 agent 可先调用 `read_session` preview，再按需调用 `read_session` full
- [x] 3.3 确保 `find_session` 仍不自动读取候选 session，不输出 preview/full context pack，不改变搜索核心、排序或结果表格字段

## 4. 测试覆盖

- [x] 4.1 扩展 `tests/session-reference/read-session-tool.test.ts`，覆盖未传 `mode` 时仍返回完整 context pack
- [x] 4.2 增加显式 `mode: "full"` 测试，确认输出与完整 context pack 行为一致
- [x] 4.3 增加 `mode: "preview"` 测试，确认输出包含 preview 标题、session 元信息、首 2 个有效 turns、末 3 个有效 turns 和 preview notice
- [x] 4.4 增加 preview 窗口重叠测试，确认短 session 不重复输出同一个 turn
- [x] 4.5 增加 preview 中间省略测试，确认存在未选中中间 turns 时输出稳定省略标记
- [x] 4.6 增加 preview 消息-only 测试，确认输出不包含 Activity、工具调用、命令、文件读取、文件编辑或 patch 明细
- [x] 4.7 增加非法 ID 测试，确认 `mode: "preview"` 不绕过完整 session ID 校验
- [x] 4.8 扩展 `tests/session-reference/find-session-tool.test.ts`，覆盖 tool 或结果提示包含 preview/full 后续读取说明

## 5. 验证

- [x] 5.1 运行 `bun run typecheck`，修复 TypeScript 类型问题
- [x] 5.2 运行 `bun test tests`，修复回归测试失败
- [x] 5.3 运行 `openspec validate add-read-session-layered-output`，确认 change 仍然有效
