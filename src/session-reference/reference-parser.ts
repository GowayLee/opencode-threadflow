import type { Part } from "@opencode-ai/sdk";

export type ParsedSessionReference = {
  sessionID: string;
  source: string;
};

export type InvalidSessionReference = {
  source: string;
  reason: string;
};

export type SessionReferenceEntry =
  | ParsedSessionReference
  | InvalidSessionReference;

export type SessionReferenceParseResult = {
  entries: SessionReferenceEntry[];
  references: ParsedSessionReference[];
  invalidReferences: InvalidSessionReference[];
};

const SESSION_REFERENCE_PATTERN = /@@([^\s`<>()\[\]{}]+)/g;
const COMPLETE_SESSION_ID_PATTERN = /^ses_[A-Za-z0-9]+$/;

export function parseSessionReferences(
  parts: Part[],
): SessionReferenceParseResult {
  const entries: SessionReferenceEntry[] = [];
  const references: ParsedSessionReference[] = [];
  const invalidReferences: InvalidSessionReference[] = [];
  const seenSessionIDs = new Set<string>();
  const seenInvalidSources = new Set<string>();

  for (const part of parts) {
    if (part.type !== "text" || part.synthetic) {
      continue;
    }

    for (const match of part.text.matchAll(SESSION_REFERENCE_PATTERN)) {
      const rawID = match[1]?.trim();
      if (!rawID) {
        continue;
      }

      const source = `@@${rawID}`;
      if (!COMPLETE_SESSION_ID_PATTERN.test(rawID)) {
        if (seenInvalidSources.has(source)) {
          continue;
        }

        seenInvalidSources.add(source);
        const invalidReference = {
          source,
          reason:
            "Explicit session references require a complete `session-id` like `@@ses_...`.",
        };
        invalidReferences.push(invalidReference);
        entries.push(invalidReference);
        continue;
      }

      if (seenSessionIDs.has(rawID)) {
        continue;
      }

      seenSessionIDs.add(rawID);
      const reference = {
        sessionID: rawID,
        source,
      };
      references.push(reference);
      entries.push(reference);
    }
  }

  return {
    entries,
    references,
    invalidReferences,
  };
}
