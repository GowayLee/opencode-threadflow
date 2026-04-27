import type { SearchResult, SearchResultSet } from "./scoring.js";
import { compareSearchResults } from "./scoring.js";

const DEFAULT_RESULT_LIMIT = 10;

export function renderSearchResults(resultSet: SearchResultSet): string {
  if (resultSet.results.length === 0) {
    return [
      "## Session Search Results",
      "",
      `Query: \`${resultSet.query}\``,
      `Window: recent ${resultSet.scanned} non-archived sessions`,
      "",
      "No matching sessions found.",
    ].join("\n");
  }

  const sorted = [...resultSet.results].sort(compareSearchResults);

  const lines = [
    "## Session Search Results",
    "",
    `Query: \`${resultSet.query}\``,
    `Window: recent ${resultSet.scanned} non-archived sessions`,
    `Results: ${sorted.length}/${DEFAULT_RESULT_LIMIT}`,
    "",
    "| Session ID | Label | Updated At | Match |",
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
