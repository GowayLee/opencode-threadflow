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

export async function searchSessions({
  client,
  directory,
  query,
  resultLimit = DEFAULT_RESULT_LIMIT,
}: SearchParams): Promise<SearchResultSet> {
  const normalizedQuery = normalizeQuery(query);
  const effectiveResultLimit = normalizeResultLimit(resultLimit);
  if (!normalizedQuery)
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

    const bucket = getMetadataMatchBucket(session, normalizedQuery);
    if (bucket === "title") {
      titleMatches.push(buildSearchResult(session, bucket));
      matchedSessionIDs.add(session.id);
      continue;
    }

    if (bucket === "slug-or-id") {
      slugOrIDMatches.push(buildSearchResult(session, bucket));
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
      query: normalizedQuery,
      exclude: matchedSessionIDs,
      remaining: effectiveResultLimit - results.length,
    });

    results.push(...transcriptMatches);
  }

  return {
    query,
    scanned: sessions.length,
    results: results.slice(0, effectiveResultLimit),
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
  query: string;
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

    if (transcriptMatchesQuery(messagesResponse.data ?? [], query)) {
      matches.push(buildSearchResult(session, "transcript"));
      exclude.add(session.id);
    }
  }

  return matches.sort(compareSearchResults);
}

function transcriptMatchesQuery(
  messages: SessionMessageLike[],
  query: string,
): boolean {
  const normalizedMessages = messages.slice(-DEFAULT_TRANSCRIPT_SAMPLE_LIMIT);

  for (const message of normalizedMessages) {
    if (normalizeQuery(extractMessageText(message)).includes(query)) {
      return true;
    }
  }

  return false;
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

function getMetadataMatchBucket(
  session: GlobalSession,
  query: string,
): SearchMatchBucket | null {
  const title = normalizeQuery(session.title);
  if (title.includes(query)) {
    return "title";
  }

  const slug = normalizeQuery(session.slug);
  const sessionID = normalizeQuery(session.id);

  if (slug.includes(query) || sessionID.includes(query)) {
    return "slug-or-id";
  }

  return null;
}

function buildSearchResult(
  session: GlobalSession,
  match: SearchMatchBucket,
): SearchResult {
  return {
    sessionID: session.id,
    label: getSessionLabel(session),
    updatedAt: session.time.updated,
    match,
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
    compareUpdatedAt(a.updatedAt, b.updatedAt) ||
    a.sessionID.localeCompare(b.sessionID)
  );
}

function compareUpdatedAt(left: number, right: number): number {
  return right - left;
}

function normalizeQuery(value: string): string {
  return value.trim().toLocaleLowerCase();
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
