import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createFindSessionTool } from "../../src/sessions/find-session-tool.ts";
import { ROOT, textPart } from "./test-helpers.ts";

type ToolDefinition = {
  description?: string;
  execute: (
    args: { query: string },
    context?: { metadata: (value: unknown) => void },
  ) => Promise<string>;
};

describe("sessions/find-session-tool", () => {
  test("describes read_session preview and full follow-up inspection", () => {
    const toolDefinition = createFindSessionTool({
      locale: "zh",
      client: {
        experimental: {
          session: {
            list: async () => ({ data: [] }),
          },
        },
        session: {
          messages: async () => ({ data: [] }),
        },
      } as never,
      directory: ROOT,
    }) as unknown as ToolDefinition;

    assert.match(toolDefinition.description ?? "", /read_session/);
    assert.match(toolDefinition.description ?? "", /mode "preview"/);
    assert.match(toolDefinition.description ?? "", /mode "full"/);
    assert.match(
      toolDefinition.description ?? "",
      /complete returned session ID/,
    );
  });

  test("returns an explanatory result for blank queries without searching", async () => {
    let listCalls = 0;
    const toolDefinition = createFindSessionTool({
      locale: "zh",
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
    assert.match(result, /未提供 query/);
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
      locale: "zh",
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
    assert.match(result, /窗口：近期 3 个未归档 session/);
    assert.match(result, /结果： 3/);
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
    assert.match(result, /使用完整 Session ID/);
    assert.match(result, /`mode: "preview"`/);
    assert.match(result, /`mode: "full"`/);
    assert.match(result, /精简消息预览/);
    assert.match(result, /完整 context pack/);
    assert.doesNotMatch(result, /# Session Context Pack/);
    assert.doesNotMatch(result, /full transcript sample text/);
    assert.deepEqual(metadataCalls, []);
  });

  test("renders no-result output", async () => {
    const toolDefinition = createFindSessionTool({
      locale: "zh",
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

    assert.match(result, /结果： 0/);
    assert.match(result, /未找到匹配的 session。/);
    assert.doesNotMatch(result, /call `read_session`/);
  });

  test("handles multi-keyword queries without returning context packs or metadata", async () => {
    let getCalls = 0;
    const metadataCalls: unknown[] = [];
    const toolDefinition = createFindSessionTool({
      locale: "zh",
      client: {
        experimental: {
          session: {
            list: async () => ({
              data: [
                {
                  id: "ses_multi_tool_title",
                  title: "Needle implementation notes",
                  slug: "implementation-notes",
                  time: { updated: 20, archived: 0 },
                },
                {
                  id: "ses_multi_tool_transcript",
                  title: "Different title",
                  slug: "different-title",
                  time: { updated: 10, archived: 0 },
                },
              ],
            }),
          },
        },
        session: {
          get: async () => {
            getCalls += 1;
            return { data: null };
          },
          messages: async ({ sessionID }: { sessionID: string }) => ({
            data:
              sessionID === "ses_multi_tool_transcript"
                ? [
                    {
                      parts: [
                        textPart(
                          "planning details should remain hidden in tool output",
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
      { query: "needle planning" },
      { metadata: (value) => metadataCalls.push(value) },
    );

    assert.match(result, /Query: `needle planning`/);
    assert.match(result, /`ses_multi_tool_title`/);
    assert.match(result, /`ses_multi_tool_transcript`/);
    assert.match(result, /使用完整 Session ID/);
    assert.match(result, /`mode: "preview"`/);
    assert.match(result, /`mode: "full"`/);
    assert.doesNotMatch(result, /# Session Context Pack/);
    assert.doesNotMatch(result, /planning details should remain hidden/);
    assert.deepEqual(metadataCalls, []);
    assert.equal(getCalls, 0);
  });

  test("returns every match in the current search window instead of ten results", async () => {
    const sessions = Array.from({ length: 12 }, (_, index) => ({
      id: `ses_many${String(index).padStart(2, "0")}`,
      title: `needle match ${index}`,
      slug: `many-${index}`,
      time: { updated: 100 - index, archived: 0 },
    }));
    const toolDefinition = createFindSessionTool({
      locale: "zh",
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

    assert.match(result, /结果： 12/);
    assert.match(result, /`ses_many00`/);
    assert.match(result, /`ses_many10`/);
    assert.match(result, /`ses_many11`/);
  });
});
