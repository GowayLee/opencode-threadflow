import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  assembleTurns,
  buildActivityIndex,
  buildSessionContextPack,
  normalizeTranscript,
  reduceTurns,
  renderContextPack,
} from "../../src/session-reference/refinement.ts";
import {
  createSampleClient,
  loadRawSample,
  ROOT,
  textPart,
} from "./test-helpers.ts";

const LONG_SYNTHETIC_TEXT = `Synthetic note:\n${"keep this context visible. ".repeat(20)}`;
const LONG_FILE_CONTEXT = [
  "<path>/workspace/src/plugin.ts</path>",
  "<type>file</type>",
  "<content>",
  ...Array.from(
    { length: 40 },
    (_, index) => `${index + 1}: export const value${index} = ${index};`,
  ),
  "</content>",
].join("\n");

describe("session-reference/refinement", () => {
  test("renders readable transcript turns with activity summaries and source-aware truncation", () => {
    const normalized = normalizeTranscript({
      session: {
        id: "ses_refineunit01",
        title: "refinement unit",
        updatedAt: 1,
      },
      messages: [
        {
          info: {
            id: "msg_user_1",
            role: "user",
          },
          parts: [
            textPart("Continue @@ses_existingref01 with src/plugin.ts"),
            textPart(LONG_SYNTHETIC_TEXT, true),
            textPart(LONG_FILE_CONTEXT, true),
            {
              type: "file",
              filename: "src/plugin.ts",
              source: {
                type: "file",
                path: "src/plugin.ts",
              },
            },
          ],
        },
        {
          info: {
            id: "msg_assistant_1",
            role: "assistant",
            parentID: "msg_user_1",
          },
          parts: [
            {
              type: "reasoning",
              text: "internal",
            },
            textPart("Finished the first pass and recorded the patch."),
            {
              type: "tool",
              tool: "read",
              state: {
                status: "completed",
                input: {
                  filePath: "src/plugin.ts",
                },
                output: "<content>full file</content>",
                metadata: {
                  loaded: true,
                  truncated: true,
                },
              },
            },
            {
              type: "tool",
              tool: "bash",
              state: {
                status: "completed",
                input: {
                  command: "bun run typecheck",
                },
                output: "typecheck output",
                metadata: {
                  exit: 0,
                },
              },
            },
            {
              type: "tool",
              tool: "question",
              state: {
                status: "completed",
                input: {
                  questions: [{ id: "q1" }],
                },
                metadata: {
                  answers: ["Use the existing plugin flow"],
                },
              },
            },
            {
              type: "tool",
              tool: "task",
              state: {
                status: "completed",
                input: {
                  description: "Refine session pack renderer",
                  subagent_type: "general",
                },
                metadata: {
                  sessionId: "ses_subtask01",
                },
              },
            },
            {
              type: "patch",
              files: ["src/plugin.ts"],
            },
            {
              type: "step-finish",
              reason: "tool-calls",
              cost: 0,
              tokens: {
                input: 0,
                output: 0,
                reasoning: 0,
                cache: { read: 0, write: 0 },
              },
            },
          ],
        },
        {
          info: {
            id: "msg_assistant_2",
            role: "assistant",
            parentID: "msg_user_1",
          },
          parts: [textPart("Implemented and ready for verification.")],
        },
        {
          info: {
            id: "msg_orphan_assistant",
            role: "assistant",
            parentID: "missing_user",
          },
          parts: [textPart("Orphan assistant payload")],
        },
      ] as never,
    });

    assert.equal(normalized.messages[0]?.synthetic, true);
    assert.equal(normalized.messages[1]?.parentID, "msg_user_1");

    const turns = assembleTurns(normalized.messages);
    assert.equal(turns.length, 2);
    assert.equal(turns[0]?.assistantMessages.length, 2);

    const reduction = reduceTurns(turns);
    const firstTurn = reduction.compressedTurns[0];
    assert.ok(firstTurn);
    assert.equal(firstTurn?.userEntries.length, 4);
    assert.ok(
      reduction.compressedContent.includes("[synthetic content truncated]"),
    );
    assert.ok(reduction.compressedContent.includes("[file content truncated]"));
    assert.ok(reduction.compressedContent.includes("[reasoning omitted]"));
    assert.ok(reduction.compressedContent.includes("[tool output truncated]"));

    const activityIndex = buildActivityIndex(reduction.compressedTurns);
    assert.deepEqual(activityIndex.filesRead, ["src/plugin.ts"]);
    assert.deepEqual(activityIndex.filesPatched, ["src/plugin.ts"]);
    assert.deepEqual(activityIndex.commands, ["bun run typecheck"]);
    assert.deepEqual(activityIndex.questionsAnswered, [
      "Use the existing plugin flow",
    ]);
    assert.deepEqual(activityIndex.subtasks, [
      "Refine session pack renderer (ses_subtask01)",
    ]);

    const rendered = renderContextPack({
      session: normalized.session,
      compressedTurns: reduction.compressedTurns,
      activitySummary: activityIndex,
      compressedContent: reduction.compressedContent,
    });

    assert.match(rendered, /## Transcript/);
    assert.match(rendered, /## Activity/);
    assert.match(rendered, /## Compressed Content/);
    assert.match(rendered, /### Turn T1/);
    assert.match(rendered, /User \(synthetic, truncated\):/);
    assert.match(rendered, /User File Context \(synthetic, truncated\):/);
    assert.match(
      rendered,
      /<path>\/workspace\/src\/plugin\.ts<\/path>\n  <type>file<\/type>/,
    );
    assert.match(rendered, /- Assistant Activity:/);
    assert.match(rendered, /read 1 file:/);
    assert.match(rendered, /executed 1 command:/);
    assert.match(rendered, /patched 1 file:/);
    assert.match(rendered, /### Read/);
    assert.match(rendered, /### Commands/);
    assert.match(rendered, /### Patches/);
    assert.match(rendered, /### Questions/);
    assert.match(rendered, /### Subtasks/);
    assert.match(
      rendered,
      /Notes: orphan assistant message for parent missing_user/,
    );
    assert.doesNotMatch(rendered, /Transcript Skeleton/);
    assert.doesNotMatch(rendered, /Activity Index/);
    assert.doesNotMatch(rendered, /Pack Coverage/);
    assert.doesNotMatch(rendered, /User Flags/);
    assert.doesNotMatch(rendered, /Step Finish/);
    assert.doesNotMatch(rendered, /Message:/);
  });

  test("builds context pack from runtime samples as readable compressed transcript packs", async () => {
    const handoffSample = await loadRawSample("ses_25ecc5a89fferms5vu4KQ9OwP3");
    const projectSample = await loadRawSample("ses_25f1d2e22ffeeau3rxS1D6je8x");
    const client = createSampleClient([handoffSample, projectSample]);

    const handoffPack = await buildSessionContextPack({
      client: client as never,
      directory: ROOT,
      sessionID: handoffSample.session.id,
    });

    assert.ok(handoffPack);
    assert.match(handoffPack, /# Session Context Pack/);
    assert.match(handoffPack, /## Transcript/);
    assert.match(handoffPack, /## Activity/);
    assert.match(handoffPack, /## Compressed Content/);
    assert.match(handoffPack, /Assistant Activity:/);
    assert.match(handoffPack, /### Read/);
    assert.match(handoffPack, /### Commands/);
    assert.match(handoffPack, /\[tool output truncated\]/);
    assert.doesNotMatch(handoffPack, /Transcript Skeleton/);
    assert.doesNotMatch(handoffPack, /Activity Index/);
    assert.doesNotMatch(handoffPack, /Pack Coverage/);
    assert.doesNotMatch(handoffPack, /Omission Policy/);
    assert.doesNotMatch(handoffPack, /message id/i);

    const projectPack = await buildSessionContextPack({
      client: client as never,
      directory: ROOT,
      sessionID: projectSample.session.id,
    });

    assert.ok(projectPack);
    assert.match(
      projectPack,
      /Title: opencode-threads 项目起点与 thread 交互设计/,
    );
    assert.match(projectPack, /User \(synthetic\):/);
    assert.match(projectPack, /User File Context \(synthetic/);
    assert.match(projectPack, /### Patches/);
    assert.match(projectPack, /\[file content truncated\]/);
  });

  test("marks repeated reads and keeps multiline injected file content readable", async () => {
    const syntheticSession = {
      session: {
        id: "ses_syntheticpack01",
        title: "synthetic injection demo",
        time: {
          updated: 1,
        },
      },
      messages: [
        {
          info: {
            id: "msg_user_1",
            sessionID: "ses_syntheticpack01",
            role: "user",
          },
          parts: [
            textPart("Please continue @@ses_existingref01"),
            textPart(LONG_FILE_CONTEXT, true),
          ],
        },
        {
          info: {
            id: "msg_assistant_1",
            sessionID: "ses_syntheticpack01",
            role: "assistant",
            parentID: "msg_user_1",
          },
          parts: [
            {
              type: "tool",
              tool: "read",
              state: {
                status: "completed",
                input: {
                  filePath: "src/plugin.ts",
                },
                output: "<content>full file</content>",
              },
            },
            {
              type: "tool",
              tool: "read",
              state: {
                status: "completed",
                input: {
                  filePath: "src/plugin.ts",
                },
                output: "<content>full file again</content>",
              },
            },
            {
              type: "tool",
              tool: "bash",
              state: {
                status: "completed",
                input: {
                  command:
                    "bun test tests/session-reference/refinement.test.ts",
                },
                output: "test output",
              },
            },
          ],
        },
      ],
    };

    const client = createSampleClient([syntheticSession]);
    const pack = await buildSessionContextPack({
      client: client as never,
      directory: ROOT,
      sessionID: "ses_syntheticpack01",
    });

    assert.ok(pack);
    assert.match(pack, /User File Context \(synthetic, truncated\):/);
    assert.match(
      pack,
      /<path>\/workspace\/src\/plugin\.ts<\/path>\n  <type>file<\/type>/,
    );
    assert.match(pack, /\[file content truncated\]/);
    assert.match(pack, /\[repeated file read omitted\]/);
    assert.match(pack, /\[tool output truncated\]/);
    assert.match(pack, /executed 1 command:/);
    assert.doesNotMatch(pack, /Coverage Mode/);
  });
});
