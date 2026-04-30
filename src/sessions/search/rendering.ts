import type { SearchResult, SearchResultSet } from "./scoring";
import { compareSearchResults } from "./scoring";
import type { Locale } from "../../i18n/types";
import { DEFAULT_LOCALE } from "../../i18n/types";
import { t } from "../../i18n";

const DEFAULT_RESULT_LIMIT = 10;

export function renderSearchResults(
  resultSet: SearchResultSet,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (resultSet.results.length === 0) {
    return [
      "## Session Search Results",
      "",
      `${t(locale, "tool.search.query_label")} \`${resultSet.query}\``,
      `${t(locale, "tool.search.window_label")} ${resultSet.scanned} ${t(locale, "tool.search.window_suffix")}`,
      "",
      t(locale, "tool.search.no_results"),
    ].join("\n");
  }

  const sorted = [...resultSet.results].sort(compareSearchResults);

  const lines = [
    "## Session Search Results",
    "",
    `${t(locale, "tool.search.query_label")} \`${resultSet.query}\``,
    `${t(locale, "tool.search.window_label")} ${resultSet.scanned} ${t(locale, "tool.search.window_suffix")}`,
    `${t(locale, "tool.search.results_label")} ${sorted.length}/${DEFAULT_RESULT_LIMIT}`,
    "",
    `| ${t(locale, "tool.search.table.session_id")} | ${t(locale, "tool.search.table.label")} | ${t(locale, "tool.search.table.updated_at")} | ${t(locale, "tool.search.table.match")} |`,
    "| --- | --- | --- | --- |",
  ];

  for (const result of sorted) {
    lines.push(
      `| \`${result.sessionID}\` | ${escapeTableCell(result.label)} | ${formatTimestamp(result.updatedAt)} | ${result.match} |`,
    );
  }

  return lines.join("\n");
}

export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

export function escapeTableCell(value: string): string {
  return value.replaceAll("|", "\\|");
}

export function normalizeResultLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, Math.trunc(limit));
}
