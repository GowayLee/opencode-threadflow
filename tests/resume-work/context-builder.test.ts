import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildResumeWorkContext,
  renderResumeWorkContext,
} from "../../src/resume-work/context-builder.ts";
import { ROOT, textPart } from "../sessions/test-helpers.ts";

type GlobalSession = {
  id: string;
  title: string;
  slug?: string;
  time: { updated: number; archived?: number };
};

describe("resume-work/context-builder", () => {
  function makeSession(
    id: string,
    title: string,
    updated: number,
    archived = 0,
  ): GlobalSession {
    return { id, title, slug: id, time: { updated, archived } };
  }

  function makeClient(sessions: GlobalSession[]) {
    const sessionsMap = new Map(sessions.map((s) => [s.id, s]));
    return {
      experimental: {
        session: {
          list: async () => ({
            data: Array.from(sessionsMap.values()).map((s) => ({
              ...s,
              slug: s.slug ?? s.id,
              time: { ...s.time, archived: s.time.archived ?? 0 },
            })),
          }),
        },
      },
      session: {
        get: async ({ sessionID }: { sessionID: string }) => {
          const session = sessionsMap.get(sessionID);
          return {
            data: session ? { ...session, time: { ...session.time } } : null,
          };
        },
        messages: async () => ({ data: [] }),
      },
    } as never;
  }

  test("builds context for exactly 5 recent sessions", async () => {
    const sessions = [
      makeSession("ses_a", "Session A", 50),
      makeSession("ses_b", "Session B", 40),
      makeSession("ses_c", "Session C", 30),
      makeSession("ses_d", "Session D", 20),
      makeSession("ses_e", "Session E", 10),
    ];
    const client = makeClient(sessions);

    const result = await buildResumeWorkContext({
      client,
      directory: ROOT,
      locale: "en",
      currentSessionID: "ses_current",
    });

    assert.equal(result.sessions.length, 5);
    assert.equal(result.sessions[0]!.sessionID, "ses_a");
    assert.equal(result.sessions[0]!.status, "loaded");
    assert.equal(result.sessions[4]!.sessionID, "ses_e");
  });

  test("returns fewer sessions when less than 5 available", async () => {
    const sessions = [
      makeSession("ses_a", "Session A", 50),
      makeSession("ses_b", "Session B", 40),
    ];
    const client = makeClient(sessions);

    const result = await buildResumeWorkContext({
      client,
      directory: ROOT,
      locale: "en",
      currentSessionID: "ses_current",
    });

    assert.equal(result.sessions.length, 2);
  });

  test("returns empty list when no sessions exist", async () => {
    const client = makeClient([]);

    const result = await buildResumeWorkContext({
      client,
      directory: ROOT,
      locale: "en",
      currentSessionID: "ses_current",
    });

    assert.equal(result.sessions.length, 0);
  });

  test("excludes current session from results", async () => {
    const sessions = [
      makeSession("ses_current", "Current Session", 50),
      makeSession("ses_a", "Session A", 40),
    ];
    const client = makeClient(sessions);

    const result = await buildResumeWorkContext({
      client,
      directory: ROOT,
      locale: "en",
      currentSessionID: "ses_current",
    });

    assert.equal(result.sessions.length, 1);
    assert.equal(result.sessions[0]!.sessionID, "ses_a");
  });

  test("excludes archived sessions", async () => {
    const sessions = [
      makeSession("ses_a", "Session A", 50),
      makeSession("ses_archived", "Archived", 60, 1),
      makeSession("ses_b", "Session B", 40),
    ];
    const client = makeClient(sessions);

    const result = await buildResumeWorkContext({
      client,
      directory: ROOT,
      locale: "en",
      currentSessionID: "ses_current",
    });

    assert.equal(result.sessions.length, 2);
    const ids = result.sessions.map((s) => s.sessionID);
    assert.deepEqual(ids, ["ses_a", "ses_b"]);
  });

  test("marks sessions as failed when session is missing", async () => {
    const sessions = [makeSession("ses_a", "Session A", 50)];
    const client = {
      experimental: {
        session: {
          list: async () => ({
            data: [
              makeSession("ses_a", "Session A", 50),
              makeSession("ses_missing", "Missing", 40),
            ],
          }),
        },
      },
      session: {
        get: async ({ sessionID }: { sessionID: string }) => {
          if (sessionID === "ses_missing") return { data: null };
          return {
            data: {
              id: "ses_a",
              title: "Session A",
              time: { updated: 50 },
              slug: "ses_a",
            },
          };
        },
        messages: async () => ({ data: [] }),
      },
    } as never;

    const result = await buildResumeWorkContext({
      client,
      directory: ROOT,
      locale: "en",
      currentSessionID: "ses_current",
    });

    assert.equal(result.sessions.length, 2);
    assert.equal(result.sessions[0]!.status, "loaded");
    assert.equal(result.sessions[1]!.status, "failed");
    assert.equal(result.sessions[1]!.sessionID, "ses_missing");
  });

  test("renders context with loaded and failed sessions", () => {
    const result = {
      sessions: [
        {
          status: "loaded" as const,
          sessionID: "ses_a",
          label: "Session A",
          context: "# Session Context Pack\n\n## Session\n- Title: Session A",
        },
        {
          status: "failed" as const,
          sessionID: "ses_b",
          label: "Session B",
          reason: "Session not found",
        },
      ],
    };

    const rendered = renderResumeWorkContext(result, "en");
    assert.match(rendered, /## Resume Work Context/);
    assert.match(rendered, /### `ses_a` Session A/);
    assert.match(rendered, /# Session Context Pack/);
    assert.match(rendered, /`ses_b`/);
    assert.match(rendered, /Session not found/);
  });

  test("renders empty context message when no sessions", () => {
    const result = { sessions: [] };
    const rendered = renderResumeWorkContext(result, "en");
    assert.match(rendered, /## Resume Work Context/);
    assert.match(rendered, /No recent non-archived sessions/);
  });

  test("renders all-failed message when all sessions fail", () => {
    const result = {
      sessions: [
        {
          status: "failed" as const,
          sessionID: "ses_a",
          label: "Session A",
          reason: "Failed to load",
        },
      ],
    };
    const rendered = renderResumeWorkContext(result, "en");
    assert.match(rendered, /Unable to load context/);
    assert.match(rendered, /Failed to load/);
    assert.doesNotMatch(rendered, /# Session Context Pack/);
  });
});
