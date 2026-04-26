export const HANDOFF_COMMAND_NAME = "handoff";

export const handoffCommand = {
  description:
    "Create an editable handoff draft for continuing work in a new session",
  template: `Create a handoff draft for the next session.

Context:
- A fresh session often loses time on file archaeology: re-reading code, rediscovering decisions, and reconstructing what matters.
- A good handoff reduces that startup cost so the next session can begin executing quickly.
- Optimize for continuity into the next session, not for archival completeness or retrospective summary.

Input semantics:
- User-provided goal text:

"""
$ARGUMENTS
"""

(This will be whitespace, if user has not provided the goal)

- If the goal text is non-empty, treat it as the next session's primary goal or focus, and let it shape the draft's direction, priorities, suggested starting actions, and related-file selection.
- If the goal text is empty or whitespace-only, infer the most natural continuation from the current session.
- When inferring continuation, prefer work that is already in progress but unfinished, directions the user already validated, or the clearest next step with the least re-discovery cost.

Your job:
- Analyze the current session and extract only the context needed to continue the work in a new session.
- Preserve what matters for execution: decisions, constraints, user preferences, technical patterns, and the most relevant files.
- Preserve validated problems, failed approaches, or rejected options only when they materially affect what the next session should do or avoid.
- Exclude chat back-and-forth, generic recap language, low-signal dead ends, and meta commentary.
- Keep the result focused on helping the next session start work quickly, not on summarizing the old session.
- Do not speculate or invent missing details. If something is uncertain, keep the wording narrow and factual.

Output constraints:
- Output only the handoff draft itself.
- Do not add commentary before or after the draft.
- Do not ask follow-up questions inside the draft.
- The draft must remain user-editable and copyable as plain Markdown.

Source session reference:
- This session has an ID (prefixed with \`ses_\`, provided in your command context).
- At the top of your draft, include the actual session ID and note that the next agent can call \`read_session\` to get full context on demand.
- The receiving agent should use the draft summary first, and only fall back to \`read_session\` for details not covered in the draft.

---

Use this exact structure:

## Handoff Draft

> **源 session**: \`<session ID>\` — 如需更多上下文，可调用 \`read_session\` 工具查看完整记录

### 当前任务背景
- Describe only the active work, current state, and why it matters for resuming execution.

### 已确认决策
- Capture decisions already made.
- Include important user preferences when they affect execution.
- Treat these as settled unless the next session finds strong new evidence.

### 约束条件
- List concrete constraints, non-goals, boundaries, and requirements that the next session must respect.

### 下一步目标
- State the immediate goal for the next session.
- If the user-provided goal text is non-empty, use it to shape this section and keep the rest of the draft aligned with it.

### 建议起步动作
- Give an execution-oriented starting plan.
- Prefer 2-5 concrete actions the next session can take immediately.
- Anchor actions to specific files, functions, modules, commands, or validation steps when possible.
- Avoid vague steps like "understand the codebase" unless paired with exactly what to inspect and why.

### 相关文件
1. @path/to/file - Briefly explain the file's role, key function/module, or why it matters for this task.

---

Rules for 相关文件:
- Include the files most relevant to continuing the work, not a broad inventory.
- Prefer files that will likely be read or edited next, plus tightly related dependencies, tests, configs, specs, or reference docs.
- Be slightly generous rather than too narrow: missing a critical file is worse than including one extra useful file.
- Usually include around 5-12 files when that context exists; include fewer only when the task is truly narrow.
- Every item must use the format 1. @path/to/file - <simple description>.
- The description should say why the file matters, not just restate the filename.
- If the session established specific functions, methods, modules, or implementation points, mention them briefly.

Quality bar:
- Be specific and action-oriented.
- Keep wording compact so the user can copy the draft into a new session without cleanup.
- Keep each section brief if little is known; do not pad the draft just to make it look complete.
- Optimize for continuity into the next session, not completeness for archival purposes.`,
} as const;
