export const en = {
  // ── Commands ────────────────────────────────────────────────

  "command.handoff.template": `Create an editable handoff note for continuing work in a new session.

Background:
- A new session often spends time re-finding files, re-reading code, and recovering previously confirmed decisions and constraints.
- A good handoff should reduce the onboarding cost so the new session can understand current work state and continue exercising judgment.
- Prioritize context transfer and continuation; do not produce an archive summary, retrospective digest, or full implementation plan.

Input semantics:
- User-provided goal text:

"""
$ARGUMENTS
"""

(If the user did not provide a goal, this will be blank text)

- If the goal text is non-empty, treat it as a continuation direction or rough task hint. Use it only to guide what relevant facts, decisions, constraints, issues, and file clues from the current session to surface and emphasize.
- Do NOT treat the goal as a primary task the next session must immediately execute, nor build a full solution design, implementation plan, or fine-grained task breakdown around it.
- If the goal text is empty or whitespace-only, infer the most natural continuation direction from the current session.
- When inferring continuation direction, prefer work that is in progress but unfinished, user-confirmed directions, or entry points that most reduce rediscovery cost.

Your task:
- Analyze the current session and extract only the information a new session needs to pick up the context.
- Preserve facts that affect subsequent judgment: current state, confirmed decisions, constraints, user preferences, technical patterns, relevant files, and unresolved issues.
- Retain verified problems, failed attempts, or rejected options only when they affect the handoff direction.
- Exclude chat back-and-forth, generic rephrasing, low-signal detours, and meta commentary.
- Help the new session understand context and start onboarding — do not complete the planning for the new session.
- Do not guess or fabricate missing information. When uncertain, narrow the phrasing and stay factual.

Output constraints:
- Output only the handoff note itself.
- Do not add extra commentary before or after the note.
- Do not embed follow-up questions within the note.
- The note MUST remain user-editable, copyable plain Markdown.

Source session reference:
- The current session has an ID starting with \`ses_\`, provided by the command context.
- Include the real session ID at the top of the note and indicate that the new agent can call \`read_session\` as needed for full context.
- The receiving agent should use the note first and fall back to \`read_session\` only when the note lacks needed detail.

Top marker block:
- You MUST output the marker block first, then \`## Handoff Note\`.
- When there are no resolved predecessor sessions:
  \`\`\`
  [handoff-source-chain]: <session ID label; session ID label; …>
  [handoff-id]: <this handoff ID>
  \`\`\`
- When there are resolved predecessor sessions:
  \`\`\`
  [handoff-source-chain]: <session ID label; session ID label; …>
  [handoff-id]: <this handoff ID>
  [handoff-predecessor-sessions]: <resolved child session ID> <label>; ...
  \`\`\`
  Generate the label based on the corresponding predecessor handoff note, briefly summarizing the child session's task direction.
- \`[handoff-source-chain]:\` MUST be the first line of the note; entries are in chronological order, formatted as \`ses_ID label\`, separated by \`; \`.
- Upstream session IDs/labels, \`this handoff ID\`, and resolved predecessor session IDs all come from the command context; upstream labels are copied verbatim.
- Generate the current session label based on your summary of current work; keep it brief and free of \`;\`.
- Copy \`this handoff ID\` verbatim; do not derive, combine, or renumber it from the current session ID. A handoff-id is not a child session ID and cannot be passed to \`read_session\`.
- When there are no resolved predecessor sessions, omit \`[handoff-predecessor-sessions]:\` entirely.
- Do not merge predecessor sessions into \`[handoff-source-chain]:\`.

Task flow section:
- When the command context includes an upstream task flow or resolved predecessor child sessions, you MUST include a \`### Task Flow\` section in the note.
- When an upstream task flow exists, output the upstream chain:
  \`\`\`
  Upstream chain:
  \\\`<oldest session ID>\\\` label → \\\`<next session ID>\\\` label → \\\`<current session ID>\\\` label
  \`\`\`
- When resolved predecessor child sessions exist, output the predecessor segment (which together with the upstream chain forms a complete view of the task flow):
  \`\`\`
  Predecessor child sessions (from the handoff note preceding this session):
  - \\\`<child session ID>\\\` — <brief child session task direction>
  - ...
  \`\`\`
  Generate each child session's brief description based on the corresponding predecessor handoff note content, to help the new session decide whether to inspect it with \`read_session\`.
- The task flow section MUST end with the reminder line: "All of the above sessions can be reviewed via \`read_session\` for full context."
- When there is neither an upstream task flow nor resolved predecessor child sessions, MUST NOT output a \`### Task Flow\` section. Instead, use the existing format: \`> **Source session**: \\\`ses_...\\\` — for more context, call the \\\`read_session\\\` tool to view the full transcript\`.

---

Use the following exact structure:

[handoff-source-chain]: <session ID label; session ID label; …>
[handoff-id]: <this handoff ID>
[handoff-predecessor-sessions]: <resolved child session ID> <label>; ...

## Handoff Note

<!-- When the command context has no resolved predecessor sessions, omit [handoff-predecessor-sessions]: entirely. -->

<!-- When the command context includes an upstream task flow or resolved predecessor child sessions, use the following task flow section: -->
### Task Flow

<!-- When upstream exists: -->
Upstream chain:
\\\`<oldest session ID>\\\` label → \\\`<next session ID>\\\` label → \\\`<current session ID>\\\` label

<!-- When predecessor child sessions exist: -->
Predecessor child sessions (from the handoff note preceding this session):
- \\\`<child session ID>\\\` — <brief child session task direction>

All of the above sessions can be reviewed via \`read_session\` for full context.

<!-- When there is neither upstream nor predecessor child sessions, use the following source reference line instead of ### Task Flow: -->
> **Source session**: \\\`<session ID>\\\` — for more context, call the \\\`read_session\\\` tool to view the full transcript

### Current Task Background
- Describe only the currently active work, current state, and why it matters for subsequent handoff.

### Confirmed Decisions
- Record confirmed decisions.
- Include user preferences that affect subsequent work.
- Unless the new session finds strong contrary evidence, treat these as settled facts.

### Constraints
- List specific constraints, non-goals, boundaries, and requirements that the new session MUST follow.

### Continuation Direction
- Describe the coarse-grained continuation direction, not a full follow-up plan.
- If the user-provided goal text is non-empty, use it to filter and emphasize contextual focus in this section and throughout the note.
- Do not decide unconfirmed technical approaches here or decompose complex goals into full execution plans.

### Opening Moves
- Give 2–5 coarse-grained actions to help the new session start onboarding context, confirm scope, or identify entry points.
- Can anchor to specific files, functions, modules, commands, or verification entry points, but do not expand into fine-grained implementation steps.
- Avoid generic "understand the codebase"; when necessary, explain what to review and why.

### Relevant Files
1. @path/to/file - Brief description of the file's role, key function/module, or why it matters for the continuation direction.

---

Relevant file rules:
- Include only the files most helpful for continuing work; do not produce a broad inventory.
- Prefer files likely to be read or edited next, along with tightly related dependencies, tests, configs, specs, or reference docs.
- Better to be slightly broad than to omit a critical file; including one extra useful file is usually better than missing a key one.
- Typically include ~5–12 files when context is sufficient; fewer only when the task is genuinely narrow.
- Every entry MUST use the format \`1. @path/to/file - <simple description>\`.
- The description should explain why the file matters, not restate the filename.
- If the session confirmed specific functions, methods, modules, or implementation points, mention them briefly.

Quality standards:
- Specific and actionable, but do not plan the full work for the new session.
- Write concisely so the user can copy the note to a new session without cleanup.
- When information is sparse, keep sections short rather than padding for completeness.
- Prioritize context continuity for the next session over archival completeness.`,

  "command.name_session.template": `Generate a structured title following the title protocol for the current session and rename it using the name_session tool.

## Title Protocol: \`[Action][Target] Topic\`

Format requirements:
- The three parts are in fixed order: \`[Action]\` → \`[Target]\` → \`Topic\`, separated by spaces
- Example: \`[Design][name_session] Title protocol and implementation plan\`

### Action Tags (10, must choose one)

| Tag       | Applicable scenarios                            |
| --------- | ----------------------------------------------- |
| [Research] | Technical research, literature review, source reading |
| [Explore]  | Free exploration, experimental attempts, prototype validation |
| [Discuss]  | Solution discussion, requirements communication, problem analysis |
| [Design]   | Architecture design, solution design, interface design |
| [Decide]   | Technology selection, trade-off decisions, direction determination |
| [Implement]| Feature implementation, coding, refactoring     |
| [Debug]    | Troubleshooting, bug fixing, performance debugging |
| [Verify]   | Test validation, result confirmation, feature acceptance |
| [Review]   | Code review, design review, security audit      |
| [Handoff]  | Handoff writing, context packaging, knowledge transfer |

### Target Selection

Select the most retrieval-valuable module name, feature name, file name, subsystem name, or concept name as \`[Target]\`, e.g. \`[core_service]\`, \`[user_layer]\`, \`[config]\`, \`[storage]\`.

Do not use vague terms such as \`[issue]\`, \`[feature]\`, \`[code]\`, \`[config]\`.

### Topic Constraints

- Keep within 8–18 English words or 30–60 characters
- Express the session's final effective output
- Retain keywords that may be useful for future searches
- Do not use full sentences or low-information-density expressions
- Do not use task management labels such as [TODO], [intent], [pending], [in progress], [completed]

## User Naming Direction

"""
$ARGUMENTS
"""

(If non-empty, the agent MUST adjust the action tag, target selection, and topic direction accordingly. For example, user input "this is about implementing the todo intent" indicates this session is about implementing the todo intent, and the title should reflect [Implement][todo] or a similar direction.)

## Execution Steps

1. Analyze the current session's conversation content and core output, incorporating the user's naming direction hint (if any)
2. Generate a title complying with the title protocol
3. Call the \`name_session\` tool with the \`title\` parameter to complete the rename
4. After completion, remind the user: the current turn used for renaming may introduce noise into this session's main task thread; the user is advised to roll back (undo/delete) the rename-related message turns after confirming the title, keeping only the title change result`,

  "command.session_search.template": `Render the plugin-provided session search result block exactly as-is.

Rules:
- The plugin may inject a synthetic text block that begins with \`## Session Search Results\`.
- If that block exists, output it verbatim and nothing else.
- If that block does not exist, output exactly: Session search is unavailable.
- Do not summarize, reformat, explain, or add extra commentary.

Search query:
"""
$ARGUMENTS
"""`,

  // ── Tools: name_session ────────────────────────────────────

  "tool.name_session.no_change": `Session title does not need to be changed.

| Field      | Value          |
| ---------- | -------------- |
| Session ID | \`{sessionID}\` |
| Title      | {title}       |

The new title is identical to the current title; no update was performed.`,

  "tool.name_session.success": `| Field      | Value                                   |
| ---------- | --------------------------------------- |
| Session ID | \`{sessionID}\`                        |
| Old title  | {oldTitle}                             |
| New title  | {newTitle}                             |

Session title updated.

> **Tip**: The current turn used for renaming may introduce noise into this session's main task thread. You are advised to roll back (undo/delete) the rename-related message turns after confirming the title, keeping only the title change result.`,

  "tool.name_session.error": `Session rename failed.

| Field      | Value                                   |
| ---------- | --------------------------------------- |
| Session ID | \`{sessionID}\`                        |
| Old title  | {oldTitle}                             |
| New title  | {newTitle} (unapplied)                 |
| Error      | {reason}                               |

Please check permissions and try again.`,

  "tool.name_session.unapplied": "(unapplied)",

  // ── Tools: find_session ────────────────────────────────────

  "tool.find_session.empty_query":
    "No query provided. Call `find_session` with a non-empty `query` keyword.",
  "tool.find_session.no_results":
    "No matching sessions found.\n\nTry a more specific or different query.",
  "tool.find_session.query_label": "Query:",
  "tool.find_session.window_label": "Window: recent",
  "tool.find_session.results_label": "Results:",
  "tool.find_session.footer_hint":
    'To inspect a candidate, call `read_session` with the complete Session ID and `mode: "preview"` for a trimmed message preview; if relevant, call `read_session` again with `mode: "full"` for the complete context pack.',

  // ── Tools: read_session ────────────────────────────────────

  "tool.read_session.incomplete_id":
    "read_session requires a complete `session-id` like `ses_...`; keywords and truncated IDs are not supported.",
  "tool.read_session.not_found": "No session was found for `{sessionID}`.",
  "tool.read_session.unreadable": "Session could not be read.",

  // ── Tools: search rendering ────────────────────────────────

  "tool.search.no_results": "No matching sessions found.",
  "tool.search.query_label": "Query:",
  "tool.search.window_label": "Window: recent",
  "tool.search.results_label": "Results:",

  // ── Hooks: handoff ─────────────────────────────────────────

  "hook.handoff.current_session_id": "Current session ID: `{sessionID}`",
  "hook.handoff.handoff_id": "This handoff ID: `{handoffID}`",
  "hook.handoff.upstream_chain": "Upstream task flow: {chain}",
  "hook.handoff.read_session_hint":
    "Use `read_session` to trace back the full task intent level by level.",
  "hook.handoff.resolved_predecessors":
    "Resolved predecessor child sessions (the handoff-id after `via` points to the corresponding handoff note in the transcript, used for generating child session labels):",
  "hook.handoff.predecessor_source_item": "- `{sessionID}` via `{handoffID}`",
  "hook.handoff.predecessor_hint":
    "These predecessor child sessions are only source pointers viewable via `read_session`, not factual summaries.",
  "hook.handoff.unresolved_predecessors": "Unresolved predecessor handoffs:",
  "hook.handoff.dont_fabricate":
    "Do not fabricate child session IDs for unresolved handoffs.",

  // ── Hooks: name_session ────────────────────────────────────

  "hook.name_session.current_session_id": "Current session ID: `{sessionID}`",
  "hook.name_session.current_title": "Current session title: {title}",
  "hook.name_session.title_unavailable": "(title unavailable)",

  // ── Render: placeholders & labels ──────────────────────────

  "render.untitled": "[untitled]",
  "render.missing_user_message": "[missing user message]",
  "render.no_included_turns": "[no included turns]",
  "render.none": "[none]",
  "render.unknown": "[unknown]",
  "render.file_content_truncated": "[file content truncated]",
  "render.synthetic_content_truncated": "[synthetic content truncated]",
  "render.reasoning_omitted": "[reasoning omitted]",
  "render.tool_output_truncated": "[tool output truncated]",
  "render.repeated_file_read_omitted": "[repeated file read omitted]",
  "render.unknown_subtask": "[unknown subtask]",
  "render.no_previewable_turns":
    "[no previewable user/assistant message turns]",
  "render.middle_turns_omitted":
    "... [{count} middle turn{plural} omitted in preview] ...",
  "render.preview_notice_title": "## Preview Notice",
  "render.preview_notice_line":
    "- This is a trimmed preview containing only selected user/assistant messages.",
  "render.preview_notice_read_full":
    '- Use read_session with mode "full" and the same complete session ID ({sessionID}) for complete context.',

  // ── Render: injector prompt ─────────────────────────────────

  "render.injector_prompt":
    "When responding, start with a brief session-reference loading report. For each successfully loaded session, list the session ID with its title. For each failed reference, note the failure reason. Keep this report concise -- at most one line per reference. Do not stop after the loading report. Continue with the user's current request, using the loaded session content as reference material when relevant.",
} as const;
