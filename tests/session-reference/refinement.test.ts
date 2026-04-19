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

describe("session-reference/refinement", () => {
  test("normalizes and assembles multi-assistant turns with orphan markers", () => {
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
            textPart(
              "[Session Reference]\n# Session Context Pack\n[/Session Reference]",
              true,
            ),
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
    assert.match(turns[1]?.markers[0] ?? "", /orphan assistant message/);

    const reduction = reduceTurns(turns);
    assert.ok(
      reduction.reducedTurns[0]?.userFlags.includes("contains-reference=true"),
    );
    assert.ok(
      reduction.reducedTurns[0]?.userFlags.includes("contains-file-part=true"),
    );
    assert.ok(
      reduction.omittedContent.includes(
        "[session reference injection omitted]",
      ),
    );
    assert.ok(reduction.omittedContent.includes("[reasoning omitted]"));
    assert.ok(reduction.omittedContent.includes("[tool output truncated]"));

    const activityIndex = buildActivityIndex(reduction.reducedTurns);
    assert.deepEqual(activityIndex.filesRead, ["src/plugin.ts"]);
    assert.deepEqual(activityIndex.filesPatched, ["src/plugin.ts"]);

    const rendered = renderContextPack({
      session: normalized.session,
      reducedTurns: reduction.reducedTurns,
      activityIndex,
      omittedContent: reduction.omittedContent,
      omittedTurnCount: reduction.omittedTurnCount,
      totalTurnCount: turns.length,
    });

    assert.match(rendered, /### Turn T1/);
    assert.match(rendered, /Patch Files: src\/plugin.ts/);
    assert.match(rendered, /Step Finish: tool-calls/);
    assert.match(
      rendered,
      /Turn Markers: orphan assistant message for parent missing_user/,
    );
  });

  test("builds context pack from runtime samples", async () => {
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
    assert.match(handoffPack, /## Transcript Skeleton/);
    assert.match(handoffPack, /## Activity Index/);
    assert.match(handoffPack, /## Omitted Content/);
    assert.match(handoffPack, /## Pack Coverage/);
    assert.match(handoffPack, /Patch Files:/);
    assert.match(handoffPack, /Questions Answered:/);
    assert.match(handoffPack, /Subtasks:/);
    assert.match(handoffPack, /\[reasoning omitted\]/);
    assert.match(handoffPack, /\[tool output truncated\]/);

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
    assert.match(projectPack, /\[synthetic read injection omitted\]/);
    assert.match(projectPack, /Files Read:/);
  });

  test("classifies synthetic session-reference content without treating it as source facts", async () => {
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
            textPart(
              "[Session Reference]\n# Session Context Pack\n[/Session Reference]",
              true,
            ),
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
              type: "reasoning",
              text: "internal",
            },
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
              type: "step-finish",
              reason: "stop",
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
      ],
    };

    const client = createSampleClient([syntheticSession]);
    const pack = await buildSessionContextPack({
      client: client as never,
      directory: ROOT,
      sessionID: "ses_syntheticpack01",
    });

    assert.ok(pack);
    assert.match(pack, /\[session reference injection omitted\]/);
    assert.match(pack, /\[tool output truncated\]/);
    assert.match(pack, /Coverage Mode:/);
  });
});
