import type { Part as CommandPart } from "@opencode-ai/sdk";
import type {
  GlobalSession,
  OpencodeClient,
  Part as SessionPart,
} from "@opencode-ai/sdk/v2";

const DEFAULT_SCAN_LIMIT = 200;
const DEFAULT_RESULT_LIMIT = 10;
const DEFAULT_TRANSCRIPT_SAMPLE_LIMIT = 8;
const UNTITLED_LABEL = "[untitled]";

export type SearchMatchBucket = "title" | "slug-or-id" | "transcript";

type SessionMessageLike = {
  parts: SessionPart[];
};

export type SearchResult = {
  sessionID: string;
  label: string;
  updatedAt: number;
  match: SearchMatchBucket;
  phraseMatched: boolean;
  matchedTermCount: number;
};

export type SearchResultSet = {
  query: string;
  scanned: number;
  results: SearchResult[];
};

type SearchParams = {
  client: OpencodeClient;
  directory: string;
  query: string;
  resultLimit?: number;
};

type ParsedSearchQuery = {
  phrase: string;
  terms: string[];
};

type MatchAnalysis = {
  phraseMatched: boolean;
  matchedTerms: string[];
  score: number;
};

export async function searchSessions({
  client,
  directory,
  query,
  resultLimit = DEFAULT_RESULT_LIMIT,
}: SearchParams): Promise<SearchResultSet> {
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
  const titleMatches: SearchResult[] = [];
  const slugOrIDMatches: SearchResult[] = [];
  const fallbackCandidates: GlobalSession[] = [];
  const matchedSessionIDs = new Set<string>();

  for (const session of sessions) {
    if (session.time.archived) continue;

    const metadataMatch = getMetadataMatch(session, parsedQuery);
    if (metadataMatch?.bucket === "title") {
      titleMatches.push(
        buildSearchResult(
          session,
          metadataMatch.bucket,
          metadataMatch.analysis,
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
    });

    results.push(...transcriptMatches);
  }

  return {
    query,
    scanned: sessions.length,
    results: results.sort(compareSearchResults).slice(0, effectiveResultLimit),
  };
}

export async function buildSessionSearchCommandParts(
  params: SearchParams,
): Promise<CommandPart[]> {
  const query = params.query.trim();
  if (!query) {
    return [
      createTextPart(
        [
          "## Session Search Results",
          "",
          "Usage: `/session-search <keyword>`",
        ].join("\n"),
      ),
    ];
  }

  const resultSet = await searchSessions(params);

  return [createTextPart(renderSearchResults(resultSet))];
}

function createTextPart(text: string): CommandPart {
  return {
    type: "text",
    text,
    synthetic: true,
  } as unknown as CommandPart;
}

async function collectTranscriptMatches({
  client,
  directory,
  sessions,
  query,
  exclude,
  remaining,
}: {
  client: OpencodeClient;
  directory: string;
  sessions: GlobalSession[];
  query: ParsedSearchQuery;
  exclude: Set<string>;
  remaining: number;
}): Promise<SearchResult[]> {
  const matches: SearchResult[] = [];

  for (const session of sessions) {
    if (matches.length >= remaining) {
      break;
    }

    if (exclude.has(session.id)) {
      continue;
    }

    const messagesResponse = await client.session.messages({
      directory,
      sessionID: session.id,
      limit: DEFAULT_TRANSCRIPT_SAMPLE_LIMIT,
    });

    const analysis = analyzeTranscriptMatch(messagesResponse.data ?? [], query);
    if (analysis) {
      matches.push(buildSearchResult(session, "transcript", analysis));
      exclude.add(session.id);
    }
  }

  return matches.sort(compareSearchResults);
}

function analyzeTranscriptMatch(
  messages: SessionMessageLike[],
  query: ParsedSearchQuery,
): MatchAnalysis | null {
  const normalizedMessages = messages.slice(-DEFAULT_TRANSCRIPT_SAMPLE_LIMIT);
  const sampleText = normalizedMessages.map(extractMessageText).join("\n");

  return analyzeTextMatch(sampleText, query);
}

function extractMessageText(message: SessionMessageLike): string {
  return message.parts
    .filter(
      (part): part is Extract<SessionPart, { type: "text" }> =>
        part.type === "text",
    )
    .filter((part) => !part.synthetic)
    .map((part) => part.text)
    .join("\n");
}

function getMetadataMatch(
  session: GlobalSession,
  query: ParsedSearchQuery,
): { bucket: SearchMatchBucket; analysis: MatchAnalysis } | null {
  const titleMatch = analyzeTextMatch(session.title, query);
  if (titleMatch) {
    return { bucket: "title", analysis: titleMatch };
  }

  const slugOrIDMatch = mergeMatchAnalyses([
    analyzeTextMatch(session.slug, query),
    analyzeTextMatch(session.id, query),
  ]);

  if (slugOrIDMatch) {
    return { bucket: "slug-or-id", analysis: slugOrIDMatch };
  }

  return null;
}

function analyzeTextMatch(
  value: string,
  query: ParsedSearchQuery,
): MatchAnalysis | null {
  const normalizedValue = normalizeQuery(value);
  if (!normalizedValue) {
    return null;
  }

  const phraseMatched = normalizedValue.includes(query.phrase);
  const matchedTerms = query.terms.filter((term) =>
    normalizedValue.includes(term),
  );

  if (!phraseMatched && matchedTerms.length === 0) {
    return null;
  }

  return {
    phraseMatched,
    matchedTerms,
    score: getMatchScore(phraseMatched, matchedTerms.length),
  };
}

function mergeMatchAnalyses(
  analyses: Array<MatchAnalysis | null>,
): MatchAnalysis | null {
  const matches = analyses.filter((analysis): analysis is MatchAnalysis =>
    Boolean(analysis),
  );
  if (matches.length === 0) {
    return null;
  }

  const matchedTerms = Array.from(
    new Set(matches.flatMap((analysis) => analysis.matchedTerms)),
  );
  const phraseMatched = matches.some((analysis) => analysis.phraseMatched);

  return {
    phraseMatched,
    matchedTerms,
    score: getMatchScore(phraseMatched, matchedTerms.length),
  };
}

function getMatchScore(
  phraseMatched: boolean,
  matchedTermCount: number,
): number {
  return (phraseMatched ? 1000 : 0) + matchedTermCount;
}

function buildSearchResult(
  session: GlobalSession,
  match: SearchMatchBucket,
  analysis: MatchAnalysis,
): SearchResult {
  return {
    sessionID: session.id,
    label: getSessionLabel(session),
    updatedAt: session.time.updated,
    match,
    phraseMatched: analysis.phraseMatched,
    matchedTermCount: analysis.matchedTerms.length,
  };
}

function getSessionLabel(session: GlobalSession): string {
  const title = session.title.trim();
  if (title) {
    return title;
  }

  const slug = session.slug.trim();
  if (slug) {
    return slug;
  }

  return UNTITLED_LABEL;
}

function renderSearchResults(resultSet: SearchResultSet): string {
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

  const lines = [
    "## Session Search Results",
    "",
    `Query: \`${resultSet.query}\``,
    `Window: recent ${resultSet.scanned} non-archived sessions`,
    `Results: ${resultSet.results.length}/${DEFAULT_RESULT_LIMIT}`,
    "",
    "| Session ID | Label | Updated At | Match |",
    "| --- | --- | --- | --- |",
  ];

  for (const result of resultSet.results.sort(compareSearchResults)) {
    lines.push(
      `| \`${result.sessionID}\` | ${escapeTableCell(result.label)} | ${formatTimestamp(result.updatedAt)} | ${result.match} |`,
    );
  }

  return lines.join("\n");
}

function compareSessions(a: GlobalSession, b: GlobalSession): number {
  return (
    compareUpdatedAt(a.time.updated, b.time.updated) || a.id.localeCompare(b.id)
  );
}

function compareSearchResults(a: SearchResult, b: SearchResult): number {
  return (
    compareMatchBucket(a.match, b.match) ||
    compareBooleanTrueFirst(a.phraseMatched, b.phraseMatched) ||
    b.matchedTermCount - a.matchedTermCount ||
    compareUpdatedAt(a.updatedAt, b.updatedAt) ||
    a.sessionID.localeCompare(b.sessionID)
  );
}

function compareMatchBucket(
  left: SearchMatchBucket,
  right: SearchMatchBucket,
): number {
  return getMatchBucketRank(left) - getMatchBucketRank(right);
}

function getMatchBucketRank(bucket: SearchMatchBucket): number {
  switch (bucket) {
    case "title":
      return 0;
    case "slug-or-id":
      return 1;
    case "transcript":
      return 2;
  }
}

function compareBooleanTrueFirst(left: boolean, right: boolean): number {
  return Number(right) - Number(left);
}

function compareUpdatedAt(left: number, right: number): number {
  return right - left;
}

function parseSearchQuery(value: string): ParsedSearchQuery | null {
  const phrase = normalizeQuery(value);
  if (!phrase) {
    return null;
  }

  return {
    phrase,
    terms: Array.from(new Set(phrase.split(" ").filter(Boolean))),
  };
}

function normalizeQuery(value: string): string {
  return value.trim().toLocaleLowerCase().replaceAll(/\s+/g, " ");
}

function normalizeResultLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, Math.trunc(limit));
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function escapeTableCell(value: string): string {
  return value.replaceAll("|", "\\|");
}
