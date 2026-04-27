import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildHandoffCommandContextText } from "../../src/handoff/command-context.ts";
import { ROOT, textPart } from "../sessions/test-helpers.ts";

describe("handoff/command-context", () => {
  test("builds context with upstream chain and resolved predecessor sessions", async () => {
    const client = createCommandContextClient({
      sessions: [
        sampleSession("ses_HOME", 50, [
          message(
            "assistant",
            "[handoff-source-chain]: ses_ROOT Root work; ses_HOME Home work\n[handoff-id]: hdfHOME-1",
          ),
        ]),
        sampleSession("ses_CHILD", 40, [
          message("user", "[handoff-id]: hdfHOME-1\nContinue work"),
        ]),
      ],
    });

    const text = await buildHandoffCommandContextText({ locale: "zh", 
      client: client as never,
      directory: ROOT,
      sessionID: "ses_HOME",
    });

    assert.match(text, /当前 session ID: `ses_HOME`/);
    assert.match(text, /本次 handoff ID: `hdfHOME-2`/);
    assert.match(text, /上游任务流: `ses_ROOT` Root work/);
    assert.match(text, /已解析前序子会话/);
    assert.match(text, /- `ses_CHILD` via `hdfHOME-1`/);
    assert.doesNotMatch(text, /未解析前序 handoff/);
  });

  test("falls back to unresolved handoff IDs when predecessor resolution fails", async () => {
    const client = createCommandContextClient({
      listThrows: true,
      sessions: [
        sampleSession("ses_HOME", 50, [
          message("assistant", "[handoff-id]: ses_HOME-1"),
        ]),
      ],
    });

    const text = await buildHandoffCommandContextText({ locale: "zh", 
      client: client as never,
      directory: ROOT,
      sessionID: "ses_HOME",
    });

    assert.match(text, /本次 handoff ID: `hdfHOME-2`/);
    assert.match(text, /未解析前序 handoff/);
    assert.match(text, /- `ses_HOME-1`/);
  });

  test("continues with current session context when transcript loading fails", async () => {
    const client = createCommandContextClient({
      messagesThrowFor: new Set(["ses_HOME"]),
      sessions: [sampleSession("ses_HOME", 50, [])],
    });

    const text = await buildHandoffCommandContextText({ locale: "zh", 
      client: client as never,
      directory: ROOT,
      sessionID: "ses_HOME",
    });

    assert.match(text, /当前 session ID: `ses_HOME`/);
    assert.match(text, /本次 handoff ID: `hdfHOME-1`/);
    assert.doesNotMatch(text, /上游任务流/);
    assert.doesNotMatch(text, /未解析前序 handoff/);
    assert.ok(text.startsWith("---\n"));
    assert.match(text, /---$/);
  });
});

function createCommandContextClient({
  sessions,
  listThrows = false,
  messagesThrowFor = new Set<string>(),
}: {
  sessions: CommandContextSession[];
  listThrows?: boolean;
  messagesThrowFor?: Set<string>;
}) {
  return {
    experimental: {
      session: {
        list: async () => {
          if (listThrows) {
            throw new Error("list failed");
          }

          return { data: sessions.map((sample) => sample.session) };
        },
      },
    },
    session: {
      messages: async ({ sessionID }: { sessionID: string }) => {
        if (messagesThrowFor.has(sessionID)) {
          throw new Error("messages failed");
        }

        return {
          data:
            sessions.find((sample) => sample.session.id === sessionID)
              ?.messages ?? [],
        };
      },
    },
  };
}

type CommandContextSession = ReturnType<typeof sampleSession>;

function sampleSession(id: string, updated: number, messages: unknown[]) {
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

function message(role: "assistant" | "user", text: string) {
  return {
    info: { role },
    parts: [textPart(text)],
  };
}
