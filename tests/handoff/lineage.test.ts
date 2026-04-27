import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  extractHandoffIDsFromMessages,
  extractHandoffIDsFromText,
  formatPredecessorSourcesForMarker,
  generateNextHandoffID,
  resolvePredecessorSessions,
} from "../../src/handoff/lineage.ts";
import { ROOT, textPart } from "../session-reference/test-helpers.ts";

describe("handoff/lineage", () => {
  describe("handoff-id parsing and generation", () => {
    test("extracts handoff IDs for the current session", () => {
      const entries = extractHandoffIDsFromText(
        [
          "[handoff-id]: ses_HOME-1",
          "[handoff-id]: ses_OTHER-9",
          "[handoff-id]: ses_HOME-2",
        ].join("\n"),
        "ses_HOME",
      );

      assert.deepEqual(entries, [
        { id: "ses_HOME-1", sessionID: "ses_HOME", sequence: 1 },
        { id: "ses_HOME-2", sessionID: "ses_HOME", sequence: 2 },
      ]);
    });

    test("generates the first handoff ID when no prior marker exists", () => {
      assert.equal(generateNextHandoffID([], "ses_HOME"), "ses_HOME-1");
    });

    test("generates the next handoff ID and ignores synthetic parts", () => {
      const messages = [
        {
          info: { role: "assistant" },
          parts: [textPart("[handoff-id]: ses_HOME-2")],
        },
        {
          info: { role: "assistant" },
          parts: [textPart("[handoff-id]: ses_HOME-99", true)],
        },
        {
          info: { role: "assistant" },
          parts: [textPart("[handoff-id]: ses_OTHER-10")],
        },
      ];

      assert.equal(generateNextHandoffID(messages, "ses_HOME"), "ses_HOME-3");
      assert.deepEqual(
        extractHandoffIDsFromMessages(messages, "ses_HOME").map(
          (entry) => entry.id,
        ),
        ["ses_HOME-2"],
      );
    });
  });

  describe("predecessor session resolution", () => {
    test("resolves predecessor only from the first non-synthetic user message", async () => {
      const client = createLineageClient([
        session("ses_CHILD", 30, [
          userMessage(
            "[handoff-source-chain]: ses_HOME Home\n[handoff-id]: ses_HOME-1",
          ),
          userMessage("later message"),
        ]),
        session("ses_LATE", 20, [
          userMessage("first message without marker"),
          userMessage("[handoff-id]: ses_HOME-2"),
        ]),
        session("ses_FUZZY", 10, [
          userMessage("same goal text but no stable handoff marker"),
        ]),
      ]);

      const result = await resolvePredecessorSessions({
        client: client as never,
        directory: ROOT,
        currentSessionID: "ses_HOME",
        handoffIDs: ["ses_HOME-1", "ses_HOME-2", "ses_HOME-3"],
      });

      assert.deepEqual(result.resolved, [
        { sessionID: "ses_CHILD", handoffID: "ses_HOME-1" },
      ]);
      assert.deepEqual(result.unresolved, ["ses_HOME-2", "ses_HOME-3"]);
      assert.deepEqual(result.ambiguous, []);
    });

    test("treats duplicate first-message matches as ambiguous", async () => {
      const client = createLineageClient([
        session("ses_CHILD_A", 30, [userMessage("[handoff-id]: ses_HOME-1")]),
        session("ses_CHILD_B", 20, [userMessage("[handoff-id]: ses_HOME-1")]),
      ]);

      const result = await resolvePredecessorSessions({
        client: client as never,
        directory: ROOT,
        currentSessionID: "ses_HOME",
        handoffIDs: ["ses_HOME-1"],
      });

      assert.deepEqual(result.resolved, []);
      assert.deepEqual(result.unresolved, []);
      assert.deepEqual(result.ambiguous, [
        { handoffID: "ses_HOME-1", sessionIDs: ["ses_CHILD_A", "ses_CHILD_B"] },
      ]);
    });

    test("formats predecessor marker payload", () => {
      assert.equal(
        formatPredecessorSourcesForMarker([
          { sessionID: "ses_CHILD", handoffID: "ses_HOME-1" },
          { sessionID: "ses_OTHER", handoffID: "ses_HOME-2" },
        ]),
        "ses_CHILD via ses_HOME-1; ses_OTHER via ses_HOME-2",
      );
    });
  });
});

function createLineageClient(samples: LineageSession[]) {
  return {
    experimental: {
      session: {
        list: async () => ({
          data: samples.map((sample) => sample.session),
        }),
      },
    },
    session: {
      messages: async ({ sessionID }: { sessionID: string }) => ({
        data:
          samples.find((sample) => sample.session.id === sessionID)?.messages ??
          [],
      }),
    },
  };
}

type LineageSession = ReturnType<typeof session>;

function session(id: string, updated: number, messages: unknown[]) {
  return {
    session: {
      id,
      title: id,
      slug: id,
      time: { updated, archived: 0 },
    },
    messages,
  };
}

function userMessage(text: string) {
  return {
    info: { role: "user" },
    parts: [textPart(text)],
  };
}
