import type {
  GlobalSession,
  OpencodeClient,
  Part as SessionPart,
} from "@opencode-ai/sdk/v2";
import type { Locale } from "../../i18n/types";
import { DEFAULT_LOCALE } from "../../i18n/types";
import { t } from "../../i18n";

const DEFAULT_TRANSCRIPT_SAMPLE_LIMIT = 8;

export function getUntitledLabel(locale: Locale = DEFAULT_LOCALE): string {
  return t(locale, "render.untitled");
}

export type SearchMatchBucket = "title" | "slug-or-id" | "transcript";

export type SessionMessageLike = {
  parts: SessionPart[];
};

export type SearchResult = {
  sessionID: string;
  label: string;
  updatedAt: number;
  match: SearchMatchBucket;
  phraseMatched: boolean;
  matchScore: number;
};

export type SearchResultSet = {
  query: string;
  scanned: number;
  results: SearchResult[];
};

export type SearchParams = {
  client: OpencodeClient;
  directory: string;
  query: string;
  resultLimit?: number;
  locale?: Locale;
};

export type ParsedSearchQuery = {
  phrase: string;
  terms: string[];
};

export type MatchAnalysis = {
  phraseMatched: boolean;
  matchedTerms: string[];
  score: number;
};

export function computeIdfWeights(
  sessions: GlobalSession[],
  terms: string[],
): Map<string, number> {
  const N = sessions.length;

  const df = new Map<string, number>();
  for (const term of terms) {
    df.set(term, 0);
  }

  for (const session of sessions) {
    const metadataText = normalizeQuery(`${session.title} ${session.slug}`);
    for (const term of terms) {
      if (metadataText.includes(term)) {
        df.set(term, (df.get(term) ?? 0) + 1);
      }
    }
  }

  const idf = new Map<string, number>();
  for (const term of terms) {
    const docFreq = df.get(term) ?? 0;
    idf.set(term, Math.log((N + 1) / (docFreq + 1)) + 1);
  }

  return idf;
}

export function parseSearchQuery(value: string): ParsedSearchQuery | null {
  const phrase = normalizeQuery(value);
  if (!phrase) {
    return null;
  }

  return {
    phrase,
    terms: Array.from(new Set(phrase.split(" ").filter(Boolean))),
  };
}

export function normalizeQuery(value: string): string {
  return value.trim().toLocaleLowerCase().replaceAll(/\s+/g, " ");
}

export function analyzeTextMatch(
  value: string,
  query: ParsedSearchQuery,
  idfWeights: Map<string, number>,
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

  const idfWeightedSum = matchedTerms.reduce(
    (sum, term) => sum + (idfWeights.get(term) ?? 1),
    0,
  );

  return {
    phraseMatched,
    matchedTerms,
    score: getMatchScore(phraseMatched, idfWeightedSum),
  };
}

export function getMatchScore(
  phraseMatched: boolean,
  idfWeightedSum: number,
): number {
  return (phraseMatched ? 1000 : 0) + idfWeightedSum;
}

export function mergeMatchAnalyses(
  analyses: Array<MatchAnalysis | null>,
  idfWeights: Map<string, number>,
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

  const idfWeightedSum = matchedTerms.reduce(
    (sum, term) => sum + (idfWeights.get(term) ?? 1),
    0,
  );

  return {
    phraseMatched,
    matchedTerms,
    score: getMatchScore(phraseMatched, idfWeightedSum),
  };
}

export function getMetadataMatch(
  session: GlobalSession,
  query: ParsedSearchQuery,
  idfWeights: Map<string, number>,
): { bucket: SearchMatchBucket; analysis: MatchAnalysis } | null {
  const titleMatch = analyzeTextMatch(session.title, query, idfWeights);
  if (titleMatch) {
    return { bucket: "title", analysis: titleMatch };
  }

  const slugOrIDMatch = mergeMatchAnalyses(
    [
      analyzeTextMatch(session.slug, query, idfWeights),
      analyzeTextMatch(session.id, query, idfWeights),
    ],
    idfWeights,
  );

  if (slugOrIDMatch) {
    return { bucket: "slug-or-id", analysis: slugOrIDMatch };
  }

  return null;
}

export function buildSearchResult(
  session: GlobalSession,
  match: SearchMatchBucket,
  analysis: MatchAnalysis,
  locale: Locale = DEFAULT_LOCALE,
): SearchResult {
  return {
    sessionID: session.id,
    label: getSessionLabel(session, locale),
    updatedAt: session.time.updated,
    match,
    phraseMatched: analysis.phraseMatched,
    matchScore: analysis.score,
  };
}

export function getSessionLabel(
  session: GlobalSession,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const title = session.title.trim();
  if (title) {
    return title;
  }

  const slug = session.slug.trim();
  if (slug) {
    return slug;
  }

  return getUntitledLabel(locale);
}

export async function collectTranscriptMatches({
  client,
  directory,
  sessions,
  query,
  exclude,
  remaining,
  idfWeights,
  locale = DEFAULT_LOCALE,
}: {
  client: OpencodeClient;
  directory: string;
  sessions: GlobalSession[];
  query: ParsedSearchQuery;
  exclude: Set<string>;
  remaining: number;
  idfWeights: Map<string, number>;
  locale?: Locale;
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

    const analysis = analyzeTranscriptMatch(
      messagesResponse.data ?? [],
      query,
      idfWeights,
    );
    if (analysis) {
      matches.push(buildSearchResult(session, "transcript", analysis, locale));
      exclude.add(session.id);
    }
  }

  return matches.sort(compareSearchResults);
}

export function analyzeTranscriptMatch(
  messages: SessionMessageLike[],
  query: ParsedSearchQuery,
  idfWeights: Map<string, number>,
): MatchAnalysis | null {
  const normalizedMessages = messages.slice(-DEFAULT_TRANSCRIPT_SAMPLE_LIMIT);
  const sampleText = normalizedMessages.map(extractMessageText).join("\n");

  return analyzeTextMatch(sampleText, query, idfWeights);
}

export function extractMessageText(message: SessionMessageLike): string {
  return message.parts
    .filter(
      (part): part is Extract<SessionPart, { type: "text" }> =>
        part.type === "text",
    )
    .filter((part) => !("synthetic" in part && part.synthetic))
    .map((part) => (part as { text: string }).text)
    .join("\n");
}

export function compareSearchResults(a: SearchResult, b: SearchResult): number {
  return (
    compareMatchBucket(a.match, b.match) ||
    compareBooleanTrueFirst(a.phraseMatched, b.phraseMatched) ||
    b.matchScore - a.matchScore ||
    compareUpdatedAt(a.updatedAt, b.updatedAt) ||
    a.sessionID.localeCompare(b.sessionID)
  );
}

export function compareSessions(a: GlobalSession, b: GlobalSession): number {
  return (
    compareUpdatedAt(a.time.updated, b.time.updated) || a.id.localeCompare(b.id)
  );
}

export function compareUpdatedAt(left: number, right: number): number {
  return right - left;
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
