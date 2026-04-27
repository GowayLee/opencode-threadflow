import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  extractHandoffIDsFromMessages,
  extractHandoffIDsFromText,
  formatPredecessorSourcesForMarker,
  generateNextHandoffID,
  resolvePredecessorSessions,
} from "../../src/handoff/lineage.ts";
import { ROOT, textPart } from "../sessions/test-helpers.ts";

describe("handoff/lineage", () => {
  describe("handoff-id parsing and generation", () => {
    test("extracts new and legacy handoff IDs for the current session", () => {
      const entries = extractHandoffIDsFromText(
        [
          "[handoff-id]: hdfHOME-1",
          "[handoff-id]: hdfOTHER-9",
          "[handoff-id]: ses_HOME-2",
          "[handoff-id]: ses_OTHER-3",
        ].join("\n"),
        "ses_HOME",
      );

      assert.deepEqual(entries, [
        { id: "hdfHOME-1", sessionID: "ses_HOME", sequence: 1 },
        { id: "ses_HOME-2", sessionID: "ses_HOME", sequence: 2 },
      ]);
    });

    test("generates the first handoff ID when no prior marker exists", () => {
      assert.equal(generateNextHandoffID([], "ses_HOME"), "hdfHOME-1");
    });

    test("generates next hdf ID from mixed history and ignores synthetic parts", () => {
      const messages = [
        {
          info: { role: "assistant" },
          parts: [textPart("[handoff-id]: hdfHOME-2")],
        },
        {
          info: { role: "assistant" },
          parts: [textPart("[handoff-id]: ses_HOME-4")],
        },
        {
          info: { role: "assistant" },
          parts: [textPart("[handoff-id]: hdfHOME-99", true)],
        },
        {
          info: { role: "assistant" },
          parts: [textPart("[handoff-id]: hdfOTHER-10")],
        },
      ];

      assert.equal(generateNextHandoffID(messages, "ses_HOME"), "hdfHOME-5");
      assert.deepEqual(
        extractHandoffIDsFromMessages(messages, "ses_HOME").map(
          (entry) => entry.id,
        ),
        ["hdfHOME-2", "ses_HOME-4"],
      );
    });
  });

  describe("predecessor session resolution", () => {
    test("resolves predecessor only from the first non-synthetic user message", async () => {
      const client = createLineageClient([
        session("ses_CHILD", 30, [
          userMessage(
            "[handoff-source-chain]: ses_HOME Home\n[handoff-id]: hdfHOME-1",
          ),
          userMessage("later message"),
        ]),
        session("ses_LATE", 20, [
          userMessage("first message without marker"),
          userMessage("[handoff-id]: hdfHOME-2"),
        ]),
        session("ses_FUZZY", 10, [
          userMessage("same goal text but no stable handoff marker"),
        ]),
      ]);

      const result = await resolvePredecessorSessions({
        client: client as never,
        directory: ROOT,
        currentSessionID: "ses_HOME",
        handoffIDs: ["hdfHOME-1", "hdfHOME-2", "hdfHOME-3"],
      });

      assert.deepEqual(result.resolved, [
        { sessionID: "ses_CHILD", handoffID: "hdfHOME-1" },
      ]);
      assert.deepEqual(result.unresolved, ["hdfHOME-2", "hdfHOME-3"]);
      assert.deepEqual(result.ambiguous, []);
    });

    test("resolves legacy handoff IDs from historical transcripts", async () => {
      const client = createLineageClient([
        session("ses_LEGACY_CHILD", 30, [
          userMessage("[handoff-id]: ses_HOME-1\nContinue legacy handoff"),
        ]),
      ]);

      const result = await resolvePredecessorSessions({
        client: client as never,
        directory: ROOT,
        currentSessionID: "ses_HOME",
        handoffIDs: ["ses_HOME-1"],
      });

      assert.deepEqual(result.resolved, [
        { sessionID: "ses_LEGACY_CHILD", handoffID: "ses_HOME-1" },
      ]);
      assert.deepEqual(result.unresolved, []);
      assert.deepEqual(result.ambiguous, []);
    });

    test("treats duplicate first-message matches as ambiguous", async () => {
      const client = createLineageClient([
        session("ses_CHILD_A", 30, [userMessage("[handoff-id]: hdfHOME-1")]),
        session("ses_CHILD_B", 20, [userMessage("[handoff-id]: hdfHOME-1")]),
      ]);

      const result = await resolvePredecessorSessions({
        client: client as never,
        directory: ROOT,
        currentSessionID: "ses_HOME",
        handoffIDs: ["hdfHOME-1"],
      });

      assert.deepEqual(result.resolved, []);
      assert.deepEqual(result.unresolved, []);
      assert.deepEqual(result.ambiguous, [
        { handoffID: "hdfHOME-1", sessionIDs: ["ses_CHILD_A", "ses_CHILD_B"] },
      ]);
    });

    test("formats predecessor marker payload", () => {
      assert.equal(
        formatPredecessorSourcesForMarker([
          { sessionID: "ses_CHILD", handoffID: "hdfHOME-1" },
          { sessionID: "ses_OTHER", handoffID: "hdfHOME-2" },
        ]),
        "ses_CHILD via hdfHOME-1; ses_OTHER via hdfHOME-2",
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
