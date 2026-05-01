import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createReadSessionTool } from "../../src/sessions/read-session-tool.ts";
import { createSampleClient, ROOT, textPart } from "./test-helpers.ts";

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

function createTool(samples: TestSample[]) {
  return createReadSessionTool({
    locale: "en",
    client: createSampleClient(samples) as never,
    directory: ROOT,
  }) as unknown as ToolDefinition;
}

function flowSession(
  id: string,
  title: string,
  updated: number,
  messages: TestSample["messages"],
) {
  return {
    session: {
      id,
      title,
      time: { updated, archived: 0 },
    },
    messages,
  };
}

function userMsg(text: string, parentID?: string) {
  return {
    info: {
      role: "user" as const,
      id: `umsg_${Math.random().toString(36).slice(2, 8)}`,
    },
    parts: [textPart(text)],
  };
}

function assistantMsg(text: string, parentID: string) {
  return {
    info: {
      role: "assistant" as const,
      id: `amsg_${Math.random().toString(36).slice(2, 8)}`,
      parentID,
    },
    parts: [textPart(text)],
  };
}

describe("sessions/read-session-handoff-successors", () => {
  test("6.1 full mode: upstream chain only, no handoff-id", async () => {
    const targetSession = flowSession("ses_FLOW01", "Add OAuth", 1000, [
      userMsg(
        "[handoff-source-chain]: ses_AAA Implement auth; ses_BBB Fix token; ses_FLOW01 Add OAuth",
      ),
      assistantMsg("Working on OAuth", "umsg_1"),
    ]);

    const tool = createTool([targetSession]);

    const result = await tool.execute(
      { sessionID: "ses_FLOW01", mode: "full" },
      { metadata: () => undefined },
    );

    assert.match(result, /## Session Flow/);
    assert.match(result, /### Upstream Chain/);
    assert.match(result, /`ses_AAA` Implement auth → `ses_BBB` Fix token/);
    assert.match(result, /### This Session/);
    assert.match(result, /`ses_FLOW01` — Add OAuth/);
    assert.match(result, /### Handoff Branches/);
    assert.match(result, /\nNone\n/);
    assert.match(
      result,
      /Use `read_session` on any session ID in the flow to inspect further/,
    );
  });

  test("6.2 full mode: downstream branches only, no upstream chain", async () => {
    const childSession = flowSession("ses_FLOW02C", "Integrate OAuth", 500, [
      userMsg("[handoff-id]: hdfFLOW02-1\nContinue the handoff"),
    ]);

    const userMsgID = "umsg_flow02";
    const targetSession = flowSession("ses_FLOW02", "Main Session", 1000, [
      {
        info: { role: "user" as const, id: userMsgID },
        parts: [textPart("Start work")],
      },
      assistantMsg(
        "[handoff-id]: hdfFLOW02-1\nHanding off to child",
        userMsgID,
      ),
    ]);

    const tool = createTool([targetSession, childSession]);
    const result = await tool.execute(
      { sessionID: "ses_FLOW02", mode: "full" },
      { metadata: () => undefined },
    );

    assert.match(result, /## Session Flow/);
    assert.match(result, /### Upstream Chain/);
    assert.match(result, /\nNone\n/);
    assert.match(result, /### This Session/);
    assert.match(result, /`ses_FLOW02` — Main Session/);
    assert.match(result, /### Handoff Branches/);
    assert.match(result, /\*\*`hdfFLOW02-1`\*\*/);
    assert.match(result, /→ `ses_FLOW02C` — Integrate OAuth/);
    assert.match(
      result,
      /Use `read_session` on any session ID in the flow to inspect further/,
    );
  });

  test("6.3 full mode: upstream chain + resolved branches", async () => {
    const childSession = flowSession("ses_FLOW03C", "Finalize", 500, [
      userMsg("[handoff-id]: hdfFLOW03-1\nComplete the handoff"),
    ]);

    const userMsgID = "umsg_flow03";
    const targetSession = flowSession("ses_FLOW03", "Middle Session", 1000, [
      {
        info: { role: "user" as const, id: userMsgID },
        parts: [
          textPart(
            "[handoff-source-chain]: ses_AAA Design; ses_FLOW03 Implement",
          ),
        ],
      },
      assistantMsg("[handoff-id]: hdfFLOW03-1\nHandoff to child", userMsgID),
    ]);

    const tool = createTool([targetSession, childSession]);
    const result = await tool.execute(
      { sessionID: "ses_FLOW03", mode: "full" },
      { metadata: () => undefined },
    );

    assert.match(result, /## Session Flow/);
    assert.match(result, /### Upstream Chain/);
    assert.match(result, /`ses_AAA` Design/);
    assert.match(result, /### This Session/);
    assert.match(result, /`ses_FLOW03` — Middle Session/);
    assert.match(result, /### Handoff Branches/);
    assert.match(result, /→ `ses_FLOW03C` — Finalize/);
    assert.match(
      result,
      /Use `read_session` on any session ID in the flow to inspect further/,
    );
  });

  test("6.4 full mode: ambiguous branches", async () => {
    const childA = flowSession("ses_FLOW04A", "Option A", 500, [
      userMsg("[handoff-id]: hdfFLOW04-1\nPick A"),
    ]);
    const childB = flowSession("ses_FLOW04B", "Option B", 400, [
      userMsg("[handoff-id]: hdfFLOW04-1\nPick B"),
    ]);

    const userMsgID = "umsg_flow04";
    const targetSession = flowSession("ses_FLOW04", "Fork Session", 1000, [
      {
        info: { role: "user" as const, id: userMsgID },
        parts: [textPart("Forking work")],
      },
      assistantMsg("[handoff-id]: hdfFLOW04-1\nMultiple options", userMsgID),
    ]);

    const tool = createTool([targetSession, childA, childB]);
    const result = await tool.execute(
      { sessionID: "ses_FLOW04", mode: "full" },
      { metadata: () => undefined },
    );

    assert.match(result, /## Session Flow/);
    assert.match(result, /### Handoff Branches/);
    assert.match(result, /\*\*`hdfFLOW04-1`\*\*/);
    assert.match(result, /→ `ses_FLOW04A` — Option A/);
    assert.match(result, /→ `ses_FLOW04B` — Option B/);
    assert.match(result, /\(2 candidates — ambiguous\)/);
  });

  test("6.5 full mode: mixed branches (resolved + ambiguous + unresolved)", async () => {
    const resolvedChild = flowSession("ses_FLOW05R", "Resolved Child", 500, [
      userMsg("[handoff-id]: hdfFLOW05-1\nResolved work"),
    ]);
    const ambiguousChildA = flowSession("ses_FLOW05A", "Ambiguous A", 400, [
      userMsg("[handoff-id]: hdfFLOW05-2\nOption A"),
    ]);
    const ambiguousChildB = flowSession("ses_FLOW05B", "Ambiguous B", 300, [
      userMsg("[handoff-id]: hdfFLOW05-2\nOption B"),
    ]);

    const userMsgID = "umsg_flow05";
    const targetSession = flowSession("ses_FLOW05", "Mixed Session", 1000, [
      {
        info: { role: "user" as const, id: userMsgID },
        parts: [textPart("Mixed handoff")],
      },
      assistantMsg(
        "[handoff-id]: hdfFLOW05-1\n[handoff-id]: hdfFLOW05-2\n[handoff-id]: hdfFLOW05-3\nMultiple handoffs",
        userMsgID,
      ),
    ]);

    const tool = createTool([
      targetSession,
      resolvedChild,
      ambiguousChildA,
      ambiguousChildB,
    ]);
    const result = await tool.execute(
      { sessionID: "ses_FLOW05", mode: "full" },
      { metadata: () => undefined },
    );

    assert.match(result, /## Session Flow/);
    assert.match(result, /### Handoff Branches/);

    // Extract the flow section for targeted assertions
    const flowStart = result.indexOf("## Session Flow");
    const afterFlow = result.slice(flowStart);
    const flowSection = afterFlow;

    // resolved branch
    assert.match(result, /\*\*`hdfFLOW05-1`\*\*/);
    assert.match(result, /→ `ses_FLOW05R` — Resolved Child/);

    // ambiguous branch
    assert.match(result, /\*\*`hdfFLOW05-2`\*\*/);
    assert.match(result, /→ `ses_FLOW05A` — Ambiguous A/);
    assert.match(result, /→ `ses_FLOW05B` — Ambiguous B/);
    assert.match(result, /\(2 candidates — ambiguous\)/);

    // unresolved branch should NOT appear in flow section
    assert.doesNotMatch(flowSection, /hdfFLOW05-3/);
  });

  test("6.6 full mode: no handoff markers → no Session Flow section", async () => {
    const userMsgID = "umsg_flow06";
    const session = flowSession("ses_FLOW06", "Plain Session", 1000, [
      {
        info: { role: "user" as const, id: userMsgID },
        parts: [textPart("Just a regular message")],
      },
      assistantMsg("Regular reply", userMsgID),
    ]);

    const tool = createTool([session]);
    const result = await tool.execute(
      { sessionID: "ses_FLOW06", mode: "full" },
      { metadata: () => undefined },
    );

    assert.doesNotMatch(result, /## Session Flow/);
    assert.match(result, /# Session Context Pack/);
    assert.match(result, /## Transcript/);
    assert.match(result, /## Activity/);
    assert.match(result, /## Compressed Content/);
  });

  test("6.7 preview mode: Session Flow section structure matches full", async () => {
    const childSession = flowSession("ses_FLOW07C", "Preview Child", 500, [
      userMsg("[handoff-id]: hdfFLOW07-1\nChild work"),
    ]);

    const userMsgID = "umsg_flow07";
    const targetSession = flowSession("ses_FLOW07", "Preview Session", 1000, [
      {
        info: { role: "user" as const, id: userMsgID },
        parts: [
          textPart(
            "[handoff-source-chain]: ses_AAA Upstream; ses_FLOW07 Current",
          ),
        ],
      },
      assistantMsg("[handoff-id]: hdfFLOW07-1\nHandoff", userMsgID),
    ]);

    const tool = createTool([targetSession, childSession]);
    const result = await tool.execute(
      { sessionID: "ses_FLOW07", mode: "preview" },
      { metadata: () => undefined },
    );

    assert.match(result, /# Session Context Preview/);
    assert.match(result, /## Session Flow/);
    assert.match(result, /### Upstream Chain/);
    assert.match(result, /`ses_AAA` Upstream/);
    assert.match(result, /### This Session/);
    assert.match(result, /`ses_FLOW07` — Preview Session/);
    assert.match(result, /### Handoff Branches/);
    assert.match(result, /\*\*`hdfFLOW07-1`\*\*/);
    assert.match(result, /→ `ses_FLOW07C` — Preview Child/);
    assert.match(
      result,
      /Use `read_session` on any session ID in the flow to inspect further/,
    );

    // Flow section should come before Transcript Preview
    const flowIndex = result.indexOf("## Session Flow");
    const previewIndex = result.indexOf("## Transcript Preview");
    assert.ok(
      flowIndex < previewIndex,
      "Session Flow should appear before Transcript Preview",
    );
  });

  test("6.8 preview mode: no handoff markers → no Session Flow section", async () => {
    const userMsgID = "umsg_flow08";
    const session = flowSession("ses_FLOW08", "Plain Preview", 1000, [
      {
        info: { role: "user" as const, id: userMsgID },
        parts: [textPart("Regular message")],
      },
      assistantMsg("Regular reply", userMsgID),
    ]);

    const tool = createTool([session]);
    const result = await tool.execute(
      { sessionID: "ses_FLOW08", mode: "preview" },
      { metadata: () => undefined },
    );

    assert.doesNotMatch(result, /## Session Flow/);
    assert.match(result, /# Session Context Preview/);
    assert.match(result, /## Session/);
    assert.match(result, /## Transcript Preview/);
  });

  test("6.9 resolvePredecessorSessions throws → flow section shows upstream only, context pack returns", async () => {
    const userMsgID = "umsg_flow09";
    const targetSession = flowSession("ses_FLOW09", "Fallback Session", 1000, [
      {
        info: { role: "user" as const, id: userMsgID },
        parts: [
          textPart(
            "[handoff-source-chain]: ses_AAA Upstream; ses_FLOW09 Current",
          ),
        ],
      },
      assistantMsg("[handoff-id]: hdfFLOW09-1\nBroken handoff", userMsgID),
    ]);

    const brokenClient = {
      session: {
        get: async ({ sessionID }: { sessionID: string }) => ({
          data: sessionID === "ses_FLOW09" ? targetSession.session : null,
        }),
        messages: async ({ sessionID }: { sessionID: string }) => ({
          data: sessionID === "ses_FLOW09" ? targetSession.messages : [],
        }),
        prompt: async () => ({ data: null }),
      },
      experimental: {
        session: {
          list: async () => {
            throw new Error("network error");
          },
        },
      },
    };

    const tool = createReadSessionTool({
      locale: "en",
      client: brokenClient as never,
      directory: ROOT,
    }) as unknown as ToolDefinition;

    const result = await tool.execute(
      { sessionID: "ses_FLOW09", mode: "full" },
      { metadata: () => undefined },
    );

    assert.match(result, /# Session Context Pack/);
    assert.match(result, /## Transcript/);

    // source-chain exists → flow section appears with upstream only
    assert.match(result, /## Session Flow/);
    assert.match(result, /### Upstream Chain/);
    assert.match(result, /### Handoff Branches/);
    assert.match(result, /\nNone\n/);
  });

  test("6.10 Session Flow section does not include branch session transcript, activity, or file content", async () => {
    const childSession = flowSession("ses_FLOW10C", "Child", 500, [
      userMsg("[handoff-id]: hdfFLOW10-1\nChild start"),
      assistantMsg("Child work done", "child_umsg"),
    ]);

    const userMsgID = "umsg_flow10";
    const targetSession = flowSession("ses_FLOW10", "Parent", 1000, [
      {
        info: { role: "user" as const, id: userMsgID },
        parts: [
          textPart(
            "[handoff-source-chain]: ses_AAA Upstream; ses_FLOW10 Parent",
          ),
        ],
      },
      assistantMsg("[handoff-id]: hdfFLOW10-1\nHandoff to child", userMsgID),
    ]);

    const tool = createTool([targetSession, childSession]);
    const result = await tool.execute(
      { sessionID: "ses_FLOW10", mode: "full" },
      { metadata: () => undefined },
    );

    // Find the Session Flow section boundaries
    const flowStart = result.indexOf("## Session Flow");
    const afterFlow = result.slice(flowStart);
    const nextSectionMatch = afterFlow.slice(1).match(/\n## /);
    const flowEnd = nextSectionMatch
      ? flowStart + 1 + (nextSectionMatch.index ?? 0)
      : result.length;
    const flowSection = result.slice(flowStart, flowEnd);

    // Should NOT include target or child session message content
    assert.doesNotMatch(flowSection, /Child work done/);
    assert.doesNotMatch(flowSection, /Handoff to child/);

    // But SHOULD include child session ID and handoff ID
    assert.match(flowSection, /ses_FLOW10C/);
    assert.match(flowSection, /hdfFLOW10-1/);
    assert.match(flowSection, /ses_AAA/);

    // Should NOT contain Activity or Transcript headers within flow section
    const flowAfterFlowHeader = flowSection.slice("## Session Flow".length);
    assert.doesNotMatch(flowAfterFlowHeader, /^## Transcript$/m);
    assert.doesNotMatch(flowAfterFlowHeader, /^## Activity$/m);
    assert.doesNotMatch(flowAfterFlowHeader, /^## Compressed Content$/m);
  });
});
