import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildSessionSearchCommandParts,
  searchSessions,
} from "../../src/session-reference/search.ts";
import { ROOT, textPart } from "./test-helpers.ts";

describe("session-reference/search", () => {
  test("keeps the default 200 -> 10 search window for title matches", async () => {
    const sessions = Array.from({ length: 220 }, (_, index) => ({
      id: `ses_search${String(index).padStart(3, "0")}`,
      title: index < 15 ? `alpha feature ${index}` : `other session ${index}`,
      slug: `slug-${index}`,
      time: {
        updated: 1000 - index,
        archived: 0,
      },
    }));

    const client = {
      experimental: {
        session: {
          list: async ({ limit }: { limit?: number } = {}) => ({
            data:
              typeof limit === "number" ? sessions.slice(0, limit) : sessions,
          }),
        },
      },
      session: {
        messages: async () => ({
          data: [],
        }),
      },
    };

    const results = await searchSessions({
      client: client as never,
      directory: ROOT,
      query: "alpha",
    });

    assert.equal(results.scanned, 200);
    assert.equal(results.results.length, 10);
    assert.ok(results.results.every((item) => item.match === "title"));
  });

  test("falls back to transcript samples and renders command output", async () => {
    const sessions = [
      {
        id: "ses_meta01",
        title: "unrelated title",
        slug: "unrelated-slug",
        time: { updated: 20, archived: 0 },
      },
      {
        id: "ses_meta02",
        title: "another unrelated title",
        slug: "another-unrelated-slug",
        time: { updated: 10, archived: 0 },
      },
    ];

    const client = {
      experimental: {
        session: {
          list: async () => ({ data: sessions }),
        },
      },
      session: {
        messages: async ({ sessionID }: { sessionID: string }) => ({
          data:
            sessionID === "ses_meta01"
              ? [
                  {
                    parts: [
                      textPart("this transcript mentions needle") as never,
                    ],
                  },
                ]
              : [{ parts: [textPart("nothing useful") as never] }],
        }),
      },
    };

    const results = await searchSessions({
      client: client as never,
      directory: ROOT,
      query: "needle",
    });

    assert.equal(results.results.length, 1);
    assert.equal(results.results[0]?.sessionID, "ses_meta01");
    assert.equal(results.results[0]?.match, "transcript");

    const commandParts = await buildSessionSearchCommandParts({
      client: client as never,
      directory: ROOT,
      query: "needle",
    });

    assert.equal(commandParts.length, 1);
    assert.match(
      (commandParts[0] as { text?: string }).text ?? "",
      /## Session Search Results/,
    );
    assert.match(
      (commandParts[0] as { text?: string }).text ?? "",
      /`ses_meta01`/,
    );
    assert.match(
      (commandParts[0] as { text?: string }).text ?? "",
      /Results: 1\/10/,
    );
  });
});
