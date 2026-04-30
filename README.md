# opencode-threadflow

A session interaction enhancement plugin for OpenCode — helps you live better with your growing, increasingly messy collection of sessions.

[中文 README →](./README_zh.md)

## Why This Plugin

As I used coding agents for development, the ever-growing number of sessions made me increasingly anxious. Those auto-titled sessions contain a ton of historical task information that I wanted to keep but couldn't bring myself to delete. Keeping them felt useless, but deleting them risked losing future reference material...

**We need to turn sessions into context packs📦 that closely follow task flows and can be flexibly invoked.**

This idea first came from observing how Amp Code handles threads. Amp Code built some very inspiring interactions around threads: handoff, referencing threads, find threads. These designs treat threads/sessions as first-class citizens in the AI coding workflow.

`opencode-threadflow` is my attempt to bring this thread-first interaction philosophy to OpenCode as a plugin. It also extends some of my own ideas around session management and interaction, building on top of Amp-Code-like thread interactions.

Special thanks to the Amp Code team for publicly sharing these product thoughts and feature designs — much of this project's inspiration comes from reading and learning from these posts:

- [Handoff](https://ampcode.com/news/handoff)
- [Find Threads](https://ampcode.com/news/find-threads)
- [Referencing Threads](https://ampcode.com/manual#referencing-threads)

## Highlights

### Slash Commands

User-triggered commands for directly initiating search, handoff, or naming flows within the current session.

#### `/handoff`: Task Handoff

Generate an **editable task handoff note** from the current session via the `/handoff` command, containing:

- Source session reference (with `read_session` hint)
- Current task background, confirmed decisions, constraints, and next-step goals
- Suggested starting actions and relevant file list

The agent in the next session can call `read_session` to review the source session's full context as needed.

> Amp Code: We encourage focusing a session on a single task... instead of summarizing the session, extract what's important for the next task. (paraphrased)

And we've gone a step further beyond the [Amp Code Thread Map](https://ampcode.com/news/thread-map): **Task Flow Lineage Tracing & Forking**. When handoffs span multiple cross-session boundaries, the plugin automatically tracks the linear task chain and resolves parallel forked child sessions derived from the current session, giving the agent a full view of the task flow when picking up work.

_The design and implementation of this feature references the [opencode-handoff plugin](https://github.com/joshuadavidthomas/opencode-handoff). Thanks to [@Thosmas](https://github.com/joshuadavidthomas) for the contribution, which provided immense help._

#### `/resume-work`: Resume Recent Work

Use `/resume-work` to instantly load full context packs from your 5 most recent non-archived sessions into the current session. Zero parameters — the plugin discovers recent sessions by pure temporal locality and injects their complete context before the command template executes.

The agent scans the injected context packs, summarizes recent work status (key decisions, current progress, unresolved issues), and indicates readiness to continue where you left off.

_Under the hood, `/resume-work` is a thin composition of existing primitives: `find_session` (empty query → recent sessions) + `read_session` (full mode)._

#### `/search-session`: Session Search

Use `/search-session <keywords>` to find candidate sessions. The agent will output a Markdown table with copyable full session IDs. Supports space-separated multi-keyword queries, sorted by match quality.

Ideal for manually locating historical sessions first, then using the target ID in `@@ses_...` references, handoff notes, or subsequent prompts.

_Since OpenCode doesn't seem to expose the ability to display plugin output directly in the chat UI, this feature can only be realized through the agent relaying the plugin's output — admittedly not the most elegant solution._

#### `/name-session`: Better Session Naming

Use `/name-session` to let the agent generate a structured title based on the current session's content and predefined rules, then call the `name_session` tool to complete the rename.

The title protocol follows the `[Action][Target] Topic` format, designed to make historical sessions easier to rediscover in lists, search results, and handoff chains.

> Why a user command instead of tweaking the built-in title generation prompt? A session's task focus shifts as the session progresses — a fixed title generated only at session start simply isn't flexible enough!

### Explicit Session Referencing (`@@ses_...`)

Use the `@@ses_<id>` syntax in messages to explicitly reference a historical session. The plugin will:

- Parse references, read the corresponding sessions, and silently inject the full context pack into the current turn's context
- Require the model to output a brief reference loading status report at the start of its reply
- Support simultaneous referencing of multiple sessions, with automatic deduplication
- Report failure reasons for invalid references in the status report

### Agent Tools

Tools for agent workflow invocation, handling candidate discovery, precise reading, and current session naming.

#### `find_session`: Autonomous Multi-keyword Historical Session Search

Agents can call the `find_session` tool to search recent non-archived sessions. Shares the same search semantics as `/search-session` (priority: title → slug/sessionID → transcript sampling), returning only candidate IDs to the agent without auto-injecting context.

#### `read_session`: Layered Session Reading

Accepts a full `ses_...` identifier and provides two output modes:

| Mode             | Purpose                    | Content                                                                              |
| ---------------- | -------------------------- | ------------------------------------------------------------------------------------ |
| `full` (default) | Retrieve full context      | Readable compressed transcript + activity summary + file/command/patch activity logs |
| `preview`        | Quick candidate evaluation | Session metadata + message bodies from the first 2 and last 3 valid dialogue turns   |

`read_session` only accepts complete session IDs. The output context pack is compressed via pure code-based rules (no reliance on agent free-form summarization).

#### `name_session`: Rename Current Session

Acts only on the current session, accepting a structured title and calling the OpenCode API to complete the rename. Typically driven by the `/name-session` command; in the future, agents may also call it directly when there's a clear need to tidy up the current session title.

## Installation

Add the `plugin` field to your OpenCode configuration file (`~/.config/opencode/opencode.json` or `opencode.json` in the project root):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-threadflow"]
}
```

Configure the `locale` option to switch language preference:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [["opencode-threadflow", { "locale": "zh" }]]
}
```

`locale` accepts `"zh"` (Simplified Chinese) or `"en"` (English), defaulting to `"en"`.

For local development and debugging, place the plugin in `~/.config/opencode/plugins/` (global) or `.opencode/plugins/` (project-level).

## Usage Examples

### `/handoff` — Task Handoff

`/handoff <task goal for the next session>`

```
/handoff Next we'll continue completing test cases for the session referencing feature
```

The agent will generate an editable handoff note.

You can freely edit the note before sending. After copying it into a new session, the receiving agent will read the contextual information in the note, review recommended related files, and call `read_session` to review the source session if more detail is needed.

### `/resume-work` — Resume Recent Work

```
/resume-work
```

The plugin automatically discovers your 5 most recent non-archived sessions (via `find_session` with empty query), loads each session's full context pack (via `read_session` in `full` mode), and injects them as synthetic text into the current turn.

The agent will then:

- Scan session titles for a high-level picture
- Extract key decisions and progress from relevant session transcripts
- Summarize recent work status concisely, grouped by work line or topic rather than listing each session one by one
- Indicate readiness to continue from where recent work left off

Edge cases:

- If no recent non-archived sessions exist outside the current session, the agent states this and offers to help with the current request.
- If some sessions fail to load, they are silently skipped with a failure note in the injected block.

### Task Flow Lineage Tracing & Forking

> Amp Code shared their [observations on Thread Map](https://ampcode.com/news/thread-map). What's Next? This is my next step ~

When handoffs span multiple cross-session boundaries, the plugin automatically tracks the **linear upstream task chain** (source-chain) and resolves the current session's **predecessor forked child sessions**, forming a task flow view that helps the agent understand the task's evolution history and context across historical sessions when advancing work in a new session.

**Linear Tracing: `[handoff-source-chain]:`**

Each handoff note records the complete upstream chain on its first line:

```
[handoff-source-chain]: ses_AAA implement user auth; ses_BBB fix token refresh; ses_CCC add OAuth
```

After copying the note into a new session, the next handoff from that new session will automatically read the `[handoff-source-chain]` at the session's start and continue building the task flow chain view:

```
`ses_AAA` implement user auth → `ses_BBB` fix token refresh → `ses_CCC` add OAuth
```

This forms a chronologically ordered task flow backbone, helping the agent in a new session understand "how the current task gradually arrived at its current state."

**Forking (Hub and Spokes): Predecessor Child Session Resolution**

A single session may spawn multiple sub-tasks, leading to multiple handoffs (numbered sequentially as `hdfCCC-1`, `hdfCCC-2`, ...), each picked up by a different child session. When generating a new handoff, the system will:

1. Scan all historical `[handoff-id]:` markers in the current session
2. Search all non-archived sessions for child sessions whose opening messages match these handoff-ids
3. Categorize results into three groups: **Resolved** (exactly one child), **Unresolved** (none found), **Ambiguous** (multiple children sharing the same handoff-id)

Upon successful resolution, the marker block and the `### Task Flow` section will present both the linear chain and fork nodes:

```markdown
[handoff-source-chain]: ses_AAA implement auth; ses_CCC add OAuth
[handoff-id]: hdfCCC-3
[handoff-predecessor-sessions]: ses_CHILD1 via hdfCCC-1; ses_CHILD2 via hdfCCC-2

### Task Flow

Upstream chain:
`ses_AAA` implement auth → `ses_CCC` add OAuth

Predecessor child sessions (originating from prior handoff notes in this session):

- `ses_CHILD1` — Fixed OAuth scope configuration issues
- `ses_CHILD2` — Completed integration test framework setup

All sessions above can be reviewed via `read_session` for full context.
```

The recipient thus gains a complete view of the task flow: linear upstream (how we got here) + parallel branches (what other directions were explored). All predecessor child session IDs serve as `read_session` tool call references.

### `/search-session` — Search Historical Sessions

```
/search-session database refactoring
```

The agent will output the search result table verbatim:

| Session ID      | Label                                               | Updated At               | Match Location |
| --------------- | --------------------------------------------------- | ------------------------ | -------------- |
| `ses_abc123...` | [implement][database] migrate to new query engine   | 2026-04-15T06:30:00.000Z | title          |
| `ses_def456...` | [discuss][database] database refactoring evaluation | 2026-04-10T03:00:00.000Z | title          |

Once you find the target session ID, you can reference it in messages via `@@ses_...` or mark it as a source session in handoff notes.

### `@@ses_...` — Explicit Historical Session Referencing

Use the `@@ses_<id>` syntax in any message to bring in a historical session's full context:

```
@@ses_abc123 Please review the previous decisions on database refactoring and help me continue the migration.
```

The agent will output a brief loading report at the start of its reply:

```
- `ses_abc123` [implement][database] migrate to new query engine — loaded
```

The agent then continues processing your request, automatically using the loaded session content as reference where relevant. Supports referencing multiple sessions in a single message, with automatic deduplication; invalid references are explained with failure reasons in the report.

### `/name-session` — Structured Rename

```
/name-session
```

The agent will analyze the current session's content, generate a structured title following the `[Action][Target] Topic` protocol, and complete the rename. It returns the change result:

| Field      | Value                                                                     |
| ---------- | ------------------------------------------------------------------------- |
| Session ID | `ses_abc123`                                                              |
| Old title  | Fix the bug                                                               |
| New title  | [implement][handoff] source-chain marker parsing and injection formatting |

> After completion, you'll be reminded to roll back the rename dialogue turn to keep the session's main task line clean.

You can also provide a naming direction hint:

```
/name-session This is about implementing handoff source-chain
```

## Development

```bash
bun install          # Install dependencies
bun run typecheck    # TypeScript type checking
bun test tests       # Run tests
```

## Acknowledgments

- [Linux DO](https://linux.do/) — Much of this project's inspiration comes from this awesome tech community.
- [Amp Code](https://ampcode.com) — A coding agent product with real vision. Sincerely wishing them success :)
- [opencode-handoff](https://github.com/joshuadavidthomas/opencode-handoff) — Inspired the form factor of our handoff functionality

## License

MIT © Hauryn Lee

---

opencode-threadflow is not built by, or affiliated with, the OpenCode team.

OpenCode is ©2026 Anomaly.
