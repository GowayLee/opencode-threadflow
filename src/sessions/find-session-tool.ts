import { tool } from "@opencode-ai/plugin";
import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import { searchSessions, type SearchResultSet } from "./search";
import type { Locale } from "../i18n/types";
import { t } from "../i18n";

export const FIND_SESSION_TOOL_NAME = "find_session";

type FindSessionToolParams = {
  client: OpencodeClient;
  directory: string;
  locale: Locale;
};

export function createFindSessionTool({
  client,
  directory,
  locale,
}: FindSessionToolParams) {
  return tool({
    description:
      'Search recent sessions by one keyword or multiple space-separated keywords and return candidate session IDs. To inspect a candidate, call read_session with a complete returned session ID and mode "preview" for a trimmed message preview, then use mode "full" if the candidate is relevant.',
    args: {
      query: tool.schema
        .string()
        .min(1)
        .describe(
          "Keyword query for recent sessions. Use spaces to combine separate clues, for example: `todo openspec implementation`.",
        ),
    },
    execute: async ({ query }) => {
      const normalizedQuery = query.trim();

      if (!normalizedQuery) {
        return renderEmptyQueryResult(locale);
      }

      const resultSet = await searchSessions({
        client,
        directory,
        query: normalizedQuery,
        resultLimit: Number.POSITIVE_INFINITY,
      });

      return renderFindSessionResults(locale, resultSet);
    },
  });
}

function renderEmptyQueryResult(locale: Locale): string {
  return [
    "# Session Search Results",
    "",
    t(locale, "tool.find_session.empty_query"),
  ].join("\n");
}

function renderFindSessionResults(
  locale: Locale,
  resultSet: SearchResultSet,
): string {
  if (resultSet.results.length === 0) {
    return [
      "# Session Search Results",
      "",
      `${t(locale, "tool.find_session.query_label")} \`${escapeCodeSpan(resultSet.query)}\``,
      `${t(locale, "tool.find_session.window_label")} ${resultSet.scanned} non-archived sessions`,
      `${t(locale, "tool.find_session.results_label")} 0`,
      "",
      t(locale, "tool.find_session.no_results"),
    ].join("\n");
  }

  const lines = [
    "# Session Search Results",
    "",
    `${t(locale, "tool.find_session.query_label")} \`${escapeCodeSpan(resultSet.query)}\``,
    `${t(locale, "tool.find_session.window_label")} ${resultSet.scanned} non-archived sessions`,
    `${t(locale, "tool.find_session.results_label")} ${resultSet.results.length}`,
    "",
    "| Session ID | Label | Updated At | Match |",
    "| --- | --- | --- | --- |",
  ];

  for (const result of resultSet.results) {
    lines.push(
      `| \`${result.sessionID}\` | ${escapeTableCell(result.label)} | ${formatTimestamp(result.updatedAt)} | ${result.match} |`,
    );
  }

  lines.push("", t(locale, "tool.find_session.footer_hint"));

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
