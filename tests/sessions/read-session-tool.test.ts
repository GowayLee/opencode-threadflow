import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createReadSessionTool } from "../../src/sessions/read-session-tool.ts";
import {
  createSampleClient,
  loadRawSample,
  ROOT,
  textPart,
} from "./test-helpers.ts";

type ReadSessionArgs = {
  sessionID: string;
  mode?: "full" | "preview";
};

type ToolDefinition = {
  execute: (
    args: ReadSessionArgs,
    context: { metadata: (value: unknown) => void },
  ) => Promise<string>;
};

type TestSample = Parameters<typeof createSampleClient>[0][number];

describe("sessions/read-session-tool", () => {
  test("rejects incomplete session ids before reading", async () => {
    const toolDefinition = createReadSessionTool({
      locale: "zh",
      client: createSampleClient([]) as never,
      directory: ROOT,
    }) as unknown as ToolDefinition;

    const metadataCalls: unknown[] = [];
    const result = await toolDefinition.execute(
      { sessionID: "partial-id" },
      { metadata: (value) => metadataCalls.push(value) },
    );

    assert.match(result, /Session could not be read\./);
    assert.match(result, /requires a complete `session-id`/);
    assert.equal(metadataCalls.length, 0);
  });

  test("returns a context pack and records metadata for valid sessions", async () => {
    const sample = await loadRawSample("ses_25ecc5a89fferms5vu4KQ9OwP3");
    const metadataCalls: unknown[] = [];
    const toolDefinition = createReadSessionTool({
      locale: "zh",
      client: createSampleClient([sample]) as never,
      directory: ROOT,
    }) as unknown as ToolDefinition;

    const result = await toolDefinition.execute(
      { sessionID: sample.session.id },
      { metadata: (value) => metadataCalls.push(value) },
    );

    assert.match(result, /# Session Context Pack/);
    assert.match(result, /## Transcript/);
    assert.match(result, /## Activity/);
    assert.match(result, /## Compressed Content/);
    assert.match(result, new RegExp(`- Title: ${sample.session.title}`));
    assert.deepEqual(metadataCalls, [
      {
        title: `Read session ${sample.session.id}`,
        metadata: {
          sessionID: sample.session.id,
          mode: "full",
        },
      },
    ]);
  });

  test("returns a full context pack when mode is explicitly full", async () => {
    const sample = await loadRawSample("ses_25ecc5a89fferms5vu4KQ9OwP3");
    const toolDefinition = createReadSessionTool({
      locale: "zh",
      client: createSampleClient([sample]) as never,
      directory: ROOT,
    }) as unknown as ToolDefinition;

    const defaultResult = await toolDefinition.execute(
      { sessionID: sample.session.id },
      { metadata: () => undefined },
    );
    const fullResult = await toolDefinition.execute(
      { sessionID: sample.session.id, mode: "full" },
      { metadata: () => undefined },
    );

    assert.equal(fullResult, defaultResult);
    assert.match(fullResult, /# Session Context Pack/);
    assert.match(fullResult, /## Activity/);
    assert.match(fullResult, /## Compressed Content/);
  });

  test("returns a preview with session metadata, first two turns, last three turns, and notice", async () => {
    const sample = createPreviewSample({
      id: "ses_preview01",
      title: "Layered Preview Session",
      turns: [
        ["user turn 1", "assistant turn 1"],
        ["user turn 2", "assistant turn 2"],
        ["user turn 3", "assistant turn 3"],
        ["user turn 4", "assistant turn 4"],
        ["user turn 5", "assistant turn 5"],
        ["user turn 6", "assistant turn 6"],
      ],
    });
    const toolDefinition = createReadSessionTool({
      locale: "zh",
      client: createSampleClient([sample]) as never,
      directory: ROOT,
    }) as unknown as ToolDefinition;

    const result = await toolDefinition.execute(
      { sessionID: sample.session.id, mode: "preview" },
      { metadata: () => undefined },
    );

    assert.match(result, /# Session Context Preview/);
    assert.match(result, /## Session/);
    assert.match(result, /- Title: Layered Preview Session/);
    assert.match(result, /- Updated At: 2023-11-14T22:13:20\.000Z/);
    assert.match(result, /## Transcript Preview/);
    assert.match(result, /### Turn T1/);
    assert.match(result, /- User: user turn 1/);
    assert.match(result, /- Assistant: assistant turn 1/);
    assert.match(result, /### Turn T2/);
    assert.match(result, /- User: user turn 2/);
    assert.doesNotMatch(result, /user turn 3/);
    assert.match(result, /中间省略 1 个轮次/);
    assert.match(result, /### Turn T4/);
    assert.match(result, /- User: user turn 4/);
    assert.match(result, /### Turn T5/);
    assert.match(result, /### Turn T6/);
    assert.match(result, /## 预览说明/);
    assert.match(result, /精简预览/);
    assert.match(result, /mode "full"/);
    assert.match(result, new RegExp(sample.session.id));
  });

  test("deduplicates overlapping preview windows for short sessions", async () => {
    const sample = createPreviewSample({
      id: "ses_preview02",
      title: "Short Preview Session",
      turns: [
        ["short user 1", "short assistant 1"],
        ["short user 2", "short assistant 2"],
        ["short user 3", "short assistant 3"],
      ],
    });
    const toolDefinition = createReadSessionTool({
      locale: "zh",
      client: createSampleClient([sample]) as never,
      directory: ROOT,
    }) as unknown as ToolDefinition;

    const result = await toolDefinition.execute(
      { sessionID: sample.session.id, mode: "preview" },
      { metadata: () => undefined },
    );

    assert.equal([...result.matchAll(/^### Turn /gm)].length, 3);
    assert.equal([...result.matchAll(/short user 2/g)].length, 1);
    assert.doesNotMatch(result, /omitted in preview/);
  });

  test("omits middle effective turns with a stable preview marker", async () => {
    const sample = createPreviewSample({
      id: "ses_preview03",
      title: "Middle Omission Session",
      turns: [
        ["edge user 1", "edge assistant 1"],
        ["edge user 2", "edge assistant 2"],
        ["middle user 3", "middle assistant 3"],
        ["middle user 4", "middle assistant 4"],
        ["edge user 5", "edge assistant 5"],
        ["edge user 6", "edge assistant 6"],
        ["edge user 7", "edge assistant 7"],
      ],
    });
    const toolDefinition = createReadSessionTool({
      locale: "zh",
      client: createSampleClient([sample]) as never,
      directory: ROOT,
    }) as unknown as ToolDefinition;

    const result = await toolDefinition.execute(
      { sessionID: sample.session.id, mode: "preview" },
      { metadata: () => undefined },
    );

    assert.match(result, /中间省略 2 个轮次/);
    assert.doesNotMatch(result, /middle user 3/);
    assert.doesNotMatch(result, /middle assistant 4/);
  });

  test("preview output contains only ordinary user and assistant text messages", async () => {
    const sample = createPreviewSample({
      id: "ses_preview04",
      title: "Messages Only Session",
      turns: [["visible user", "visible assistant"]],
      extraAssistantParts: [
        { type: "reasoning", text: "hidden reasoning" },
        {
          type: "tool",
          tool: "bash",
          state: {
            status: "completed",
            input: { command: "npm test -- hidden" },
            output: "hidden command output",
          },
        },
        { type: "patch", files: ["hidden-patch.ts"] },
        {
          type: "file",
          filename: "hidden-file.ts",
          source: { type: "file", path: "hidden-file.ts" },
        },
        textPart("hidden synthetic metadata", true),
      ],
    });
    const toolDefinition = createReadSessionTool({
      locale: "zh",
      client: createSampleClient([sample]) as never,
      directory: ROOT,
    }) as unknown as ToolDefinition;

    const result = await toolDefinition.execute(
      { sessionID: sample.session.id, mode: "preview" },
      { metadata: () => undefined },
    );

    assert.match(result, /visible user/);
    assert.match(result, /visible assistant/);
    assert.doesNotMatch(result, /# Session Context Pack/);
    assert.doesNotMatch(result, /## Activity/);
    assert.doesNotMatch(result, /## Compressed Content/);
    assert.doesNotMatch(result, /Assistant Activity/);
    assert.doesNotMatch(result, /hidden reasoning/);
    assert.doesNotMatch(result, /npm test -- hidden/);
    assert.doesNotMatch(result, /hidden command output/);
    assert.doesNotMatch(result, /hidden-patch\.ts/);
    assert.doesNotMatch(result, /hidden-file\.ts/);
    assert.doesNotMatch(result, /hidden synthetic metadata/);
  });

  test("preview normalizes ordinary message text to one line like full mode", async () => {
    const sample = createPreviewSample({
      id: "ses_preview05",
      title: "Inline Preview Session",
      turns: [
        ["user line 1\n\nuser line 2", "assistant   line 1\nassistant line 2"],
      ],
    });
    const toolDefinition = createReadSessionTool({
      locale: "zh",
      client: createSampleClient([sample]) as never,
      directory: ROOT,
    }) as unknown as ToolDefinition;

    const result = await toolDefinition.execute(
      { sessionID: sample.session.id, mode: "preview" },
      { metadata: () => undefined },
    );

    assert.match(result, /- User: user line 1 user line 2/);
    assert.match(result, /- Assistant: assistant line 1 assistant line 2/);
    assert.doesNotMatch(result, /- User:\n/);
    assert.doesNotMatch(result, /- Assistant:\n/);
  });

  test("preview mode still rejects incomplete session ids before reading", async () => {
    const toolDefinition = createReadSessionTool({
      locale: "zh",
      client: createSampleClient([]) as never,
      directory: ROOT,
    }) as unknown as ToolDefinition;

    const metadataCalls: unknown[] = [];
    const result = await toolDefinition.execute(
      { sessionID: "partial-id", mode: "preview" },
      { metadata: (value) => metadataCalls.push(value) },
    );

    assert.match(result, /Session could not be read\./);
    assert.match(result, /requires a complete `session-id`/);
    assert.equal(metadataCalls.length, 0);
  });
});

function createPreviewSample(input: {
  id: string;
  title: string;
  turns: Array<[string, string]>;
  extraAssistantParts?: Array<Record<string, unknown>>;
}): TestSample {
  const messages: TestSample["messages"] = [];

  input.turns.forEach(([userText, assistantText], index) => {
    const turnNumber = index + 1;
    const userID = `msg_user_${turnNumber}`;
    messages.push({
      info: {
        id: userID,
        role: "user",
      },
      parts: [textPart(userText)],
    });
    messages.push({
      info: {
        id: `msg_assistant_${turnNumber}`,
        role: "assistant",
        parentID: userID,
      },
      parts: [
        textPart(assistantText),
        ...(index === 0 ? (input.extraAssistantParts ?? []) : []),
      ],
    });
  });

  return {
    session: {
      id: input.id,
      title: input.title,
      time: {
        updated: 1_700_000_000_000,
      },
    },
    messages,
  };
}
