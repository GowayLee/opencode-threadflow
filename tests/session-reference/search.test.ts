import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildSessionSearchCommandParts,
  searchSessions,
} from "../../src/session-reference/search/index.ts";
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

    const commandParts = await buildSessionSearchCommandParts({
      client: client as never,
      directory: ROOT,
      query: "alpha",
    });
    const commandText = (commandParts[0] as { text?: string }).text ?? "";

    assert.match(commandText, /Results: 10\/10/);
    assert.match(commandText, /`ses_search009`/);
    assert.doesNotMatch(commandText, /`ses_search010`/);
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

  test("recalls candidates that match any space-separated keyword", async () => {
    const sessions = [
      {
        id: "ses_multi_title",
        title: "Alpha planning notes",
        slug: "planning-notes",
        time: { updated: 30, archived: 0 },
      },
      {
        id: "ses_multi_slug",
        title: "Unrelated title",
        slug: "beta-workflow",
        time: { updated: 20, archived: 0 },
      },
      {
        id: "ses_multi_transcript",
        title: "Another unrelated title",
        slug: "other-workflow",
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
            sessionID === "ses_multi_transcript"
              ? [{ parts: [textPart("gamma appears in the sample") as never] }]
              : [{ parts: [textPart("nothing useful") as never] }],
        }),
      },
    };

    const results = await searchSessions({
      client: client as never,
      directory: ROOT,
      query: "alpha beta gamma",
    });

    assert.deepEqual(
      results.results.map((result) => [result.sessionID, result.match]),
      [
        ["ses_multi_title", "title"],
        ["ses_multi_slug", "slug-or-id"],
        ["ses_multi_transcript", "transcript"],
      ],
    );
  });

  test("ranks full phrase matches before partial keyword matches in a bucket", async () => {
    const sessions = [
      {
        id: "ses_phrase_partial",
        title: "Alpha planning notes",
        slug: "partial",
        time: { updated: 100, archived: 0 },
      },
      {
        id: "ses_phrase_full",
        title: "Alpha beta planning notes",
        slug: "full",
        time: { updated: 1, archived: 0 },
      },
    ];

    const client = {
      experimental: {
        session: {
          list: async () => ({ data: sessions }),
        },
      },
      session: {
        messages: async () => ({ data: [] }),
      },
    };

    const results = await searchSessions({
      client: client as never,
      directory: ROOT,
      query: "alpha beta",
    });

    assert.deepEqual(
      results.results.map((result) => result.sessionID),
      ["ses_phrase_full", "ses_phrase_partial"],
    );
  });

  test("ranks candidates that match more keywords ahead in a bucket", async () => {
    const sessions = [
      {
        id: "ses_terms_one",
        title: "Alpha planning notes",
        slug: "one-term",
        time: { updated: 100, archived: 0 },
      },
      {
        id: "ses_terms_two",
        title: "Alpha beta planning notes",
        slug: "two-terms",
        time: { updated: 1, archived: 0 },
      },
    ];

    const client = {
      experimental: {
        session: {
          list: async () => ({ data: sessions }),
        },
      },
      session: {
        messages: async () => ({ data: [] }),
      },
    };

    const results = await searchSessions({
      client: client as never,
      directory: ROOT,
      query: "alpha beta gamma",
    });

    assert.deepEqual(
      results.results.map((result) => result.sessionID),
      ["ses_terms_two", "ses_terms_one"],
    );
  });

  test("uses updated time and session id for stable sorting at equal quality", async () => {
    const sessions = [
      {
        id: "ses_sort_b",
        title: "Alpha notes",
        slug: "sort-b",
        time: { updated: 10, archived: 0 },
      },
      {
        id: "ses_sort_c",
        title: "Alpha notes",
        slug: "sort-c",
        time: { updated: 20, archived: 0 },
      },
      {
        id: "ses_sort_a",
        title: "Alpha notes",
        slug: "sort-a",
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
        messages: async () => ({ data: [] }),
      },
    };

    const results = await searchSessions({
      client: client as never,
      directory: ROOT,
      query: "alpha beta",
    });

    assert.deepEqual(
      results.results.map((result) => result.sessionID),
      ["ses_sort_c", "ses_sort_a", "ses_sort_b"],
    );
  });
});
