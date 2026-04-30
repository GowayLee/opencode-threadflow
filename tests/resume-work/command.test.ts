import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { registerResumeWorkHooks } from "../../src/resume-work/index.ts";

describe("resume-work/command", () => {
  function makeClient(
    sessions: Array<{
      id: string;
      title: string;
      updated: number;
      archived?: number;
    }>,
  ) {
    return {
      experimental: {
        session: {
          list: async () => ({
            data: sessions.map((s) => ({
              id: s.id,
              title: s.title,
              slug: s.id,
              time: { updated: s.updated, archived: s.archived ?? 0 },
            })),
          }),
        },
      },
      session: {
        get: async ({ sessionID }: { sessionID: string }) => {
          const found = sessions.find((s) => s.id === sessionID);
          return {
            data: found
              ? {
                  id: found.id,
                  title: found.title,
                  time: { updated: found.updated },
                  slug: found.id,
                }
              : null,
          };
        },
        messages: async () => ({ data: [] }),
      },
    } as never;
  }

  test("injects synthetic text part when command is resume-work", async () => {
    const client = makeClient([
      { id: "ses_a", title: "Recent work", updated: 50 },
    ]);
    const hooks = registerResumeWorkHooks({
      client,
      directory: "/tmp",
      locale: "en",
    });
    const output = {
      parts: [] as Array<{ type: string; text: string; synthetic?: boolean }>,
    };

    await hooks["command.execute.before"](
      { command: "resume-work", sessionID: "ses_current" },
      output,
    );

    assert.equal(output.parts.length, 1);
    assert.equal(output.parts[0]!.type, "text");
    assert.equal(output.parts[0]!.synthetic, true);
    assert.match(output.parts[0]!.text, /## Resume Work Context/);
    assert.match(output.parts[0]!.text, /ses_a/);
  });

  test("does not inject when command is not resume-work", async () => {
    const client = makeClient([]);
    const hooks = registerResumeWorkHooks({
      client,
      directory: "/tmp",
      locale: "en",
    });
    const output = { parts: [] as Array<{ type: string; text: string }> };

    await hooks["command.execute.before"](
      { command: "handoff", sessionID: "ses_current" },
      output,
    );

    assert.equal(output.parts.length, 0);
  });

  test("injects no-recent-sessions message when no sessions exist", async () => {
    const client = makeClient([]);
    const hooks = registerResumeWorkHooks({
      client,
      directory: "/tmp",
      locale: "en",
    });
    const output = {
      parts: [] as Array<{ type: string; text: string; synthetic?: boolean }>,
    };

    await hooks["command.execute.before"](
      { command: "resume-work", sessionID: "ses_current" },
      output,
    );

    assert.equal(output.parts.length, 1);
    assert.equal(output.parts[0]!.synthetic, true);
    assert.match(output.parts[0]!.text, /No recent non-archived sessions/);
  });

  test("synthetic part is marked with synthetic: true", async () => {
    const client = makeClient([
      { id: "ses_a", title: "Test session", updated: 50 },
    ]);
    const hooks = registerResumeWorkHooks({
      client,
      directory: "/tmp",
      locale: "en",
    });
    const output = {
      parts: [] as Array<{ type: string; text: string; synthetic?: boolean }>,
    };

    await hooks["command.execute.before"](
      { command: "resume-work", sessionID: "ses_current" },
      output,
    );

    assert.equal(output.parts[0]!.synthetic, true);
  });
});
