export const HANDOFF_COMMAND_NAME = "handoff";

export const handoffCommand = {
  description:
    "Create an editable handoff draft for continuing work in a new session",
  template: `Create a handoff draft for the next session.

Input semantics:
- Optional input: /handoff [goal]
- User-provided goal text:

"""
$ARGUMENTS
"""

- If the goal text is non-empty, treat it as the next session's primary goal or focus.
- If the goal text is empty or whitespace-only, infer the most natural next step from the current session.

Your job:
- Analyze the current session and extract only the context needed to continue the work in a new session.
- Preserve what matters for execution: decisions, constraints, user preferences, technical patterns, and the most relevant files.
- Exclude chat back-and-forth, dead ends, generic recap language, and meta commentary.
- Keep the result focused on helping the next session start work quickly, not on summarizing the old session.

Output constraints:
- Output only the handoff draft itself.
- Do not add commentary before or after the draft.
- Do not mention read_session, sessionID, automatic file injection, automatic new-session creation, or automatic continuation.
- Do not ask follow-up questions inside the draft.
- The draft must remain user-editable and copyable as plain Markdown.

Use this exact structure:

## Handoff Draft

### 当前任务背景
- Summarize the active work, current state, and why it matters for the next session.

### 已确认决策
- Capture decisions already made.
- Include important user preferences when they affect execution.

### 约束条件
- List concrete constraints, non-goals, boundaries, and requirements that the next session must respect.

### 下一步目标
- State the immediate goal for the next session.
- If the user-provided goal text is non-empty, use it to shape this section.

### 建议起步动作
- Give a execution-oriented starting plan.
- Prefer several concrete actions the next session can take immediately.

### 相关文件
1. @path/to/file - Briefly explain the file's role, key function/module, or why it matters for this task.

Rules for 相关文件:
- Include the files most relevant to continuing the work, not a broad inventory.
- Prefer files that will likely be read or edited next, plus tightly related tests, configs, or reference docs.
- Every item must use the format 1. @path/to/file - <simple description>.
- The description should say why the file matters, not just restate the filename.
- If the session established specific functions, methods, modules, or implementation points, mention them briefly.

Quality bar:
- Be specific and action-oriented.
- Keep wording compact so the user can copy the draft into a new session without cleanup.
- Optimize for continuity into the next session, not completeness for archival purposes.`,
} as const;
