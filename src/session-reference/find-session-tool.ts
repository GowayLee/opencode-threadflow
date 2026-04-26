import { tool } from "@opencode-ai/plugin";
import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import { searchSessions, type SearchResultSet } from "./search";

export const FIND_SESSION_TOOL_NAME = "find_session";

type FindSessionToolParams = {
  client: OpencodeClient;
  directory: string;
};

export function createFindSessionTool({
  client,
  directory,
}: FindSessionToolParams) {
  return tool({
    description:
      "Search recent sessions by keyword and return candidate session IDs. Use read_session with a complete returned session ID to inspect a candidate.",
    args: {
      query: tool.schema
        .string()
        .min(1)
        .describe("Keyword to search for in recent sessions"),
    },
    execute: async ({ query }) => {
      const normalizedQuery = query.trim();

      if (!normalizedQuery) {
        return renderEmptyQueryResult();
      }

      const resultSet = await searchSessions({
        client,
        directory,
        query: normalizedQuery,
        resultLimit: Number.POSITIVE_INFINITY,
      });

      return renderFindSessionResults(resultSet);
    },
  });
}

function renderEmptyQueryResult(): string {
  return [
    "# Session Search Results",
    "",
    "No query provided. Call `find_session` with a non-empty `query` keyword.",
  ].join("\n");
}

function renderFindSessionResults(resultSet: SearchResultSet): string {
  if (resultSet.results.length === 0) {
    return [
      "# Session Search Results",
      "",
      `Query: \`${escapeCodeSpan(resultSet.query)}\``,
      `Window: recent ${resultSet.scanned} non-archived sessions`,
      "Results: 0",
      "",
      "No matching sessions found.",
      "",
      "Try a more specific or different query.",
    ].join("\n");
  }

  const lines = [
    "# Session Search Results",
    "",
    `Query: \`${escapeCodeSpan(resultSet.query)}\``,
    `Window: recent ${resultSet.scanned} non-archived sessions`,
    `Results: ${resultSet.results.length}`,
    "",
    "| Session ID | Label | Updated At | Match |",
    "| --- | --- | --- | --- |",
  ];

  for (const result of resultSet.results) {
    lines.push(
      `| \`${result.sessionID}\` | ${escapeTableCell(result.label)} | ${formatTimestamp(result.updatedAt)} | ${result.match} |`,
    );
  }

  lines.push(
    "",
    "To inspect a candidate, call `read_session` with the complete Session ID.",
  );

  return lines.join("\n");
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function escapeTableCell(value: string): string {
  return value.replaceAll("|", "\\|");
}

function escapeCodeSpan(value: string): string {
  return value.replaceAll("`", "\\`");
}
