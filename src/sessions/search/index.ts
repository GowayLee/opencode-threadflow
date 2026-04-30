import type { Part as CommandPart } from "@opencode-ai/sdk";
import type { GlobalSession, OpencodeClient } from "@opencode-ai/sdk/v2";
import {
  computeIdfWeights,
  parseSearchQuery,
  getMetadataMatch,
  buildSearchResult,
  collectTranscriptMatches,
  compareSearchResults,
  compareSessions,
} from "./scoring";
import { renderSearchResults, normalizeResultLimit } from "./rendering";
import type { Locale } from "../../i18n/types";
import { DEFAULT_LOCALE } from "../../i18n/types";
import { t } from "../../i18n";

const DEFAULT_SCAN_LIMIT = 200;
const DEFAULT_RESULT_LIMIT = 10;

export type {
  SearchMatchBucket,
  SearchResult,
  SearchResultSet,
  SearchParams,
} from "./scoring";

export {
  compareSearchResults,
  compareSessions,
  compareUpdatedAt,
  buildSearchResult,
  getSessionLabel,
} from "./scoring";

export {
  renderSearchResults,
  formatTimestamp,
  escapeTableCell,
  normalizeResultLimit,
} from "./rendering";

export async function searchSessions({
  client,
  directory,
  query,
  resultLimit = DEFAULT_RESULT_LIMIT,
  locale = DEFAULT_LOCALE,
}: {
  client: OpencodeClient;
  directory: string;
  query: string;
  resultLimit?: number;
  locale?: Locale;
}): Promise<{
  query: string;
  scanned: number;
  results: {
    sessionID: string;
    label: string;
    updatedAt: number;
    match: "title" | "slug-or-id" | "transcript";
    phraseMatched: boolean;
    matchScore: number;
  }[];
}> {
  const parsedQuery = parseSearchQuery(query);
  const effectiveResultLimit = normalizeResultLimit(resultLimit);
  if (!parsedQuery)
    return {
      query: "",
      scanned: DEFAULT_SCAN_LIMIT,
      results: [],
    };

  const sessionsResponse = await client.experimental.session.list({
    directory,
    archived: false,
    limit: DEFAULT_SCAN_LIMIT,
  });

  const sessions = [...(sessionsResponse.data ?? [])].sort(compareSessions);

  const idfWeights = computeIdfWeights(sessions, parsedQuery.terms);

  const titleMatches: ReturnType<typeof buildSearchResult>[] = [];
  const slugOrIDMatches: ReturnType<typeof buildSearchResult>[] = [];
  const fallbackCandidates: GlobalSession[] = [];
  const matchedSessionIDs = new Set<string>();

  for (const session of sessions) {
    if (session.time.archived) continue;

    const metadataMatch = getMetadataMatch(session, parsedQuery, idfWeights);
    if (metadataMatch?.bucket === "title") {
      titleMatches.push(
        buildSearchResult(
          session,
          metadataMatch.bucket,
          metadataMatch.analysis,
          locale,
        ),
      );
      matchedSessionIDs.add(session.id);
      continue;
    }

    if (metadataMatch?.bucket === "slug-or-id") {
      slugOrIDMatches.push(
        buildSearchResult(
          session,
          metadataMatch.bucket,
          metadataMatch.analysis,
          locale,
        ),
      );
      matchedSessionIDs.add(session.id);
      continue;
    }

    fallbackCandidates.push(session);
  }

  const results = [...titleMatches, ...slugOrIDMatches];

  if (results.length < effectiveResultLimit) {
    const transcriptMatches = await collectTranscriptMatches({
      client,
      directory,
      sessions: fallbackCandidates,
      query: parsedQuery,
      exclude: matchedSessionIDs,
      remaining: effectiveResultLimit - results.length,
      idfWeights,
      locale,
    });

    results.push(...transcriptMatches);
  }

  return {
    query,
    scanned: sessions.length,
    results: results.sort(compareSearchResults).slice(0, effectiveResultLimit),
  };
}

export async function buildSessionSearchCommandParts({
  client,
  directory,
  query,
  locale = DEFAULT_LOCALE,
}: {
  client: OpencodeClient;
  directory: string;
  query: string;
  locale?: Locale;
}): Promise<CommandPart[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [
      createTextPart(
        ["## Session Search Results", "", t(locale, "tool.search.usage")].join(
          "\n",
        ),
      ),
    ];
  }

  const resultSet = await searchSessions({
    client,
    directory,
    query: trimmed,
    locale,
  });

  return [createTextPart(renderSearchResults(resultSet, locale))];
}

function createTextPart(text: string): CommandPart {
  return {
    type: "text",
    text,
    synthetic: true,
  } as unknown as CommandPart;
}
