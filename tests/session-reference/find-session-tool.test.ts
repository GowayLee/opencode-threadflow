import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createFindSessionTool } from "../../src/session-reference/find-session-tool.ts";
import { ROOT, textPart } from "./test-helpers.ts";

type ToolDefinition = {
  execute: (
    args: { query: string },
    context?: { metadata: (value: unknown) => void },
  ) => Promise<string>;
};

describe("session-reference/find-session-tool", () => {
  test("returns an explanatory result for blank queries without searching", async () => {
    let listCalls = 0;
    const toolDefinition = createFindSessionTool({
      client: {
        experimental: {
          session: {
            list: async () => {
              listCalls += 1;
              return { data: [] };
            },
          },
        },
        session: {
          messages: async () => ({ data: [] }),
        },
      } as never,
      directory: ROOT,
    }) as unknown as ToolDefinition;

    const result = await toolDefinition.execute({ query: "   " });

    assert.match(result, /# Session Search Results/);
    assert.match(result, /No query provided/);
    assert.equal(listCalls, 0);
  });

  test("renders title, slug-or-id, and transcript matches with complete ids", async () => {
    const sessions = [
      {
        id: "ses_title01",
        title: "Needle planning notes",
        slug: "planning-notes",
        time: { updated: 30, archived: 0 },
      },
      {
        id: "ses_slug01",
        title: "Unrelated title",
        slug: "needle-slug",
        time: { updated: 20, archived: 0 },
      },
      {
        id: "ses_transcript01",
        title: "Another unrelated title",
        slug: "other-slug",
        time: { updated: 10, archived: 0 },
      },
    ];
    const metadataCalls: unknown[] = [];
    const toolDefinition = createFindSessionTool({
      client: {
        experimental: {
          session: {
            list: async () => ({ data: sessions }),
          },
        },
        session: {
          messages: async ({ sessionID }: { sessionID: string }) => ({
            data:
              sessionID === "ses_transcript01"
                ? [
                    {
                      parts: [
                        textPart(
                          "needle appears in this full transcript sample text",
                        ) as never,
                      ],
                    },
                  ]
                : [{ parts: [textPart("nothing useful") as never] }],
          }),
        },
      } as never,
      directory: ROOT,
    }) as unknown as ToolDefinition;

    const result = await toolDefinition.execute(
      { query: " needle " },
      { metadata: (value) => metadataCalls.push(value) },
    );

    assert.match(result, /Query: `needle`/);
    assert.match(result, /Window: recent 3 non-archived sessions/);
    assert.match(result, /Results: 3/);
    assert.match(
      result,
      /\| `ses_title01` \| Needle planning notes \| .* \| title \|/,
    );
    assert.match(
      result,
      /\| `ses_slug01` \| Unrelated title \| .* \| slug-or-id \|/,
    );
    assert.match(
      result,
      /\| `ses_transcript01` \| Another unrelated title \| .* \| transcript \|/,
    );
    assert.match(result, /call `read_session` with the complete Session ID/);
    assert.doesNotMatch(result, /# Session Context Pack/);
    assert.doesNotMatch(result, /full transcript sample text/);
    assert.deepEqual(metadataCalls, []);
  });

  test("renders no-result output", async () => {
    const toolDefinition = createFindSessionTool({
      client: {
        experimental: {
          session: {
            list: async () => ({
              data: [
                {
                  id: "ses_noresult01",
                  title: "Different topic",
                  slug: "different-topic",
                  time: { updated: 1, archived: 0 },
                },
              ],
            }),
          },
        },
        session: {
          messages: async () => ({
            data: [{ parts: [textPart("nothing useful") as never] }],
          }),
        },
      } as never,
      directory: ROOT,
    }) as unknown as ToolDefinition;

    const result = await toolDefinition.execute({ query: "needle" });

    assert.match(result, /Results: 0/);
    assert.match(result, /No matching sessions found\./);
    assert.doesNotMatch(result, /call `read_session`/);
  });

  test("returns every match in the current search window instead of ten results", async () => {
    const sessions = Array.from({ length: 12 }, (_, index) => ({
      id: `ses_many${String(index).padStart(2, "0")}`,
      title: `needle match ${index}`,
      slug: `many-${index}`,
      time: { updated: 100 - index, archived: 0 },
    }));
    const toolDefinition = createFindSessionTool({
      client: {
        experimental: {
          session: {
            list: async ({ limit }: { limit?: number } = {}) => ({
              data:
                typeof limit === "number" ? sessions.slice(0, limit) : sessions,
            }),
          },
        },
        session: {
          messages: async () => ({ data: [] }),
        },
      } as never,
      directory: ROOT,
    }) as unknown as ToolDefinition;

    const result = await toolDefinition.execute({ query: "needle" });

    assert.match(result, /Results: 12/);
    assert.match(result, /`ses_many00`/);
    assert.match(result, /`ses_many10`/);
    assert.match(result, /`ses_many11`/);
  });
});
