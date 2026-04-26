# AGENTS.md - opencode-threadflow

## OVERVIEW

`opencode-threadflow` 是一个 OpenCode 插件项目。当前仓库已实现 `handoff`、`session-search`、显式 session 引用、`find_session`、以及支持 `preview` / `full` 分层输出的 `read_session`；核心目标仍是围绕 thread/session 的承接、引用与检索能力。

## STRUCTURE

```
./
├── docs/                         # 项目文档、研究、样本和设计参考
│   ├── intro.md                  # 项目起点、范围、非目标
│   ├── runtime-transcript-structure-notes.md  # 真实 transcript 结构笔记
│   ├── session-refinement-tool-design-reference.md  # context pack 设计参考
│   ├── todo.md                   # 当前待办/草稿，不是规范
│   ├── research/                 # 研究资料与来源索引
│   └── transcript-samples/       # 会话样本与派生产物
├── openspec/                     # 规范、变更、归档
│   ├── config.yaml               # OpenSpec 语言与产出约束
│   ├── specs/                    # 当前生效的需求规范
│   └── changes/archive/          # 已归档的变更记录与历史设计
├── scripts/                      # 诊断、转换、渲染脚本
├── src/                          # 插件运行时代码
│   ├── plugin.ts                 # 插件入口，装配命令、工具与 hook
│   ├── commands/                 # slash command 模板与注册
│   └── session-reference/        # 显式 session 引用、搜索、注入、精炼
├── tests/                        # node:test 用例，覆盖 session-reference 与 session discovery
├── package.json                  # Bun/ESM 入口与脚本
└── tsconfig.json                 # 严格 TypeScript 配置
```

`handoff-ref/` 是外部只读参考，不属于本仓库的实现边界。

## SUBAGENT HIERARCHY

- `./AGENTS.md` - 根目录导航
- `./docs/AGENTS.md` - 文档树导航
- `./docs/transcript-samples/AGENTS.md` - 样本与派生产物专用说明
- `./src/AGENTS.md` - 运行时代码说明
- `./src/session-reference/AGENTS.md` - session-reference 子系统说明

在任一子树工作时，先读最近的子级 `AGENTS.md`，再补读父级。

## WHERE TO LOOK

| 目的                    | 文件                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------ |
| 项目目标与范围          | `docs/intro.md`                                                                      |
| 真实 transcript 结构    | `docs/runtime-transcript-structure-notes.md`                                         |
| context pack 设计背景   | `docs/session-refinement-tool-design-reference.md`                                   |
| 研究索引                | `docs/research/README.md`                                                            |
| OpenCode 插件边界       | `docs/research/opencode-plugin-development-notes.md`                                 |
| 参考实现拆解            | `docs/research/handoff-ref-analysis.md`                                              |
| Amp thread 交互意图     | `docs/research/amp-thread-patterns.md`                                               |
| handoff 规范            | `openspec/specs/handoff/spec.md`                                                     |
| handoff source 引用规范 | `openspec/specs/handoff-session-reference/spec.md`                                   |
| session-reference 规范  | `openspec/specs/session-reference/spec.md`                                           |
| session discovery 规范  | `openspec/specs/session-discovery-tool/spec.md`                                      |
| 插件入口                | `src/plugin.ts`                                                                      |
| 命令注册与模板          | `src/commands/index.ts`、`src/commands/handoff.ts`、`src/commands/session-search.ts` |
| session 引用实现        | `src/session-reference/*`                                                            |
| 测试镜像                | `tests/session-reference/*`                                                          |
| 样本与派生产物          | `docs/transcript-samples/*`                                                          |
| 样本/结构检查脚本       | `scripts/inspect-transcripts.ts`                                                     |
| context pack 渲染脚本   | `scripts/render-session-context-pack.mjs`                                            |

## CODE MAP

| 路径                                         | 用途                                                                                                                                                                                   |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/plugin.ts`                              | 创建 `createOpencodeClient`，注册 `commands`、`read_session`、`find_session`，并在 `command.execute.before` / `chat.message` 中接入 handoff source 注入、session-search 与显式引用注入 |
| `src/commands/index.ts`                      | 聚合所有 slash command                                                                                                                                                                 |
| `src/commands/handoff.ts`                    | `handoff` 的可编辑草稿模板                                                                                                                                                             |
| `src/commands/session-search.ts`             | `session-search` 的精确输出协议                                                                                                                                                        |
| `src/session-reference/reference-parser.ts`  | 解析 `@@ses_...` 引用                                                                                                                                                                  |
| `src/session-reference/search.ts`            | `/session-search` 与 `find_session` 共享的 session 检索与结果渲染核心                                                                                                                  |
| `src/session-reference/injector.ts`          | 构造 synthetic 引用上下文并注入当前轮                                                                                                                                                  |
| `src/session-reference/find-session-tool.ts` | `find_session` 工具定义与候选结果渲染                                                                                                                                                  |
| `src/session-reference/read-session-tool.ts` | `read_session` 工具定义与完整 ID 校验                                                                                                                                                  |
| `src/session-reference/refinement.ts`        | transcript 归一化、压缩与 `full` / `preview` 输出渲染                                                                                                                                  |
| `tests/session-reference/*`                  | 显式引用、搜索、发现、`read_session` 分层输出的行为回归测试                                                                                                                            |

## CONVENTIONS

- 运行时使用 Bun + ESM；TypeScript 处于严格模式，`noEmit`。
- 只用 `bun run typecheck` 做类型检查；测试入口是 `bun test tests`。
- `find_session` 负责关键词候选发现，`read_session` 只接受完整 `ses_...` 标识，不能退化为关键词检索。
- `read_session` 支持 `full` 与 `preview` 两种模式；显式 `@@ses_...` 注入仍固定使用完整 context pack。
- `@@ses_...` 是显式引用语法；插件层负责解析与上下文附加。
- 显式引用加载反馈通过 `chat.message` 注入的 model-prompt 引导模型输出，不能靠工具 metadata 暗示替代。
- `session-search` 必须原样输出插件注入的结果块，不能自行总结或改写。
- `handoff` 输出必须保持可编辑 Markdown 草稿，不做自动新建 session 的前提假设。
- `handoff` 命令执行前会注入当前 session ID，draft 顶部必须保留源 session 引用与 `read_session` 提示。

## ANTI-PATTERNS (THIS PROJECT)

- 不要把 session-reference 逻辑塞回 `src/plugin.ts`。
- 不要让 `find_session` 读取 context pack，也不要让 `read_session` 兼做模糊搜索、别名搜索或摘要生成器。
- 不要因为 `read_session` 支持 `preview` 就把显式 `@@ses_...` 注入自动降级成 preview。
- 不要给 `session-search` 加额外解释、前后缀或重排表格。
- 不要把 handoff draft 中提到的 session 线索当成当前轮的隐式引用触发器。
- 不要把 derived 样本和真实实现混为一谈。
- 不要改动归档的 OpenSpec 记录来伪造当前状态。

## UNIQUE STYLES

- OpenSpec 产出使用简体中文，但 `MUST/SHALL/SHOULD/MAY/WHEN/THEN` 保持英文。
- 命令模板、搜索结果块和 context pack 都是稳定协议，优先保持可复制、可测试。
- 研究文档服务于实现决策，规范文档服务于行为边界，样本目录服务于验证。

## COMMANDS

| 命令                                                       | 说明                             |
| ---------------------------------------------------------- | -------------------------------- |
| `bun run typecheck`                                        | TypeScript 类型检查              |
| `bun test tests`                                           | 运行测试套件                     |
| `bun scripts/inspect-transcripts.ts`                       | 重新抓取并摘要历史 session 样本  |
| `bun scripts/render-session-context-pack.mjs <session-id>` | 生成单个 session 的 context pack |

## NOTES

- `docs/transcript-samples/runtime/*` 下的 `raw.json`、`summary.json`、`pack.md` 是成对的派生产物。
- 当行为变化影响样本时，优先更新测试，再更新派生产物，再回看文档。
- 如果发现子目录行为边界变化，优先新增/更新最近的子级 `AGENTS.md`，不要把所有规则堆在根目录。
