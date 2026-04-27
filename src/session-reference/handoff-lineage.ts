import type { GlobalSession, OpencodeClient } from "@opencode-ai/sdk/v2";

const HANDOFF_ID_LINE_RE =
  /^\[handoff-id\]:\s+(ses_[A-Za-z0-9]+)-([1-9]\d*)\s*$/gm;
const DEFAULT_PREDECESSOR_SCAN_LIMIT = 200;

export interface HandoffIDEntry {
  id: string;
  sessionID: string;
  sequence: number;
}

export interface HandoffPredecessorSource {
  sessionID: string;
  handoffID: string;
}

export interface HandoffPredecessorResolution {
  resolved: HandoffPredecessorSource[];
  unresolved: string[];
  ambiguous: Array<{ handoffID: string; sessionIDs: string[] }>;
}

type MessageLike = {
  info?: { role?: string };
  role?: string;
  parts?: unknown[];
};

type TextPartLike = {
  type?: string;
  synthetic?: boolean;
  text?: string;
};

export function extractHandoffIDsFromText(
  text: string,
  currentSessionID: string,
): HandoffIDEntry[] {
  const entries = new Map<string, HandoffIDEntry>();
  const re = new RegExp(HANDOFF_ID_LINE_RE.source, "gm");
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const sessionID = match[1]!;
    if (sessionID !== currentSessionID) {
      continue;
    }

    const sequence = Number.parseInt(match[2]!, 10);
    const id = `${sessionID}-${sequence}`;
    entries.set(id, { id, sessionID, sequence });
  }

  return [...entries.values()].sort((a, b) => a.sequence - b.sequence);
}

export function extractHandoffIDsFromMessages(
  messages: MessageLike[],
  currentSessionID: string,
): HandoffIDEntry[] {
  const entries = new Map<string, HandoffIDEntry>();

  for (const message of messages) {
    for (const text of getNonSyntheticTextParts(message)) {
      for (const entry of extractHandoffIDsFromText(text, currentSessionID)) {
        entries.set(entry.id, entry);
      }
    }
  }

  return [...entries.values()].sort((a, b) => a.sequence - b.sequence);
}

export function generateNextHandoffID(
  messages: MessageLike[],
  currentSessionID: string,
): string {
  const existing = extractHandoffIDsFromMessages(messages, currentSessionID);
  const maxSequence = existing.reduce(
    (max, entry) => Math.max(max, entry.sequence),
    0,
  );

  return `${currentSessionID}-${maxSequence + 1}`;
}

export async function resolvePredecessorSessions({
  client,
  directory,
  currentSessionID,
  handoffIDs,
}: {
  client: OpencodeClient;
  directory: string;
  currentSessionID: string;
  handoffIDs: string[];
}): Promise<HandoffPredecessorResolution> {
  const uniqueHandoffIDs = Array.from(new Set(handoffIDs));
  const matches = new Map<string, string[]>();
  for (const handoffID of uniqueHandoffIDs) {
    matches.set(handoffID, []);
  }

  if (uniqueHandoffIDs.length === 0) {
    return { resolved: [], unresolved: [], ambiguous: [] };
  }

  const sessionsResponse = await client.experimental.session.list({
    directory,
    archived: false,
    limit: DEFAULT_PREDECESSOR_SCAN_LIMIT,
  });
  const sessions = [...(sessionsResponse.data ?? [])]
    .filter((session) => !session.time.archived)
    .filter((session) => session.id !== currentSessionID)
    .sort(compareSessions);

  for (const session of sessions) {
    const firstUserText = await getFirstUserMessageText({
      client,
      directory,
      session,
    });
    if (!firstUserText) {
      continue;
    }

    for (const handoffID of uniqueHandoffIDs) {
      if (containsExactHandoffIDMarker(firstUserText, handoffID)) {
        matches.get(handoffID)!.push(session.id);
      }
    }
  }

  const resolved: HandoffPredecessorSource[] = [];
  const unresolved: string[] = [];
  const ambiguous: Array<{ handoffID: string; sessionIDs: string[] }> = [];

  for (const handoffID of uniqueHandoffIDs) {
    const sessionIDs = matches.get(handoffID) ?? [];
    if (sessionIDs.length === 1) {
      resolved.push({ sessionID: sessionIDs[0]!, handoffID });
    } else if (sessionIDs.length > 1) {
      ambiguous.push({ handoffID, sessionIDs });
    } else {
      unresolved.push(handoffID);
    }
  }

  return { resolved, unresolved, ambiguous };
}

export function formatPredecessorSourcesForMarker(
  sources: HandoffPredecessorSource[],
): string {
  return sources
    .map((source) => `${source.sessionID} via ${source.handoffID}`)
    .join("; ");
}

function containsExactHandoffIDMarker(
  text: string,
  handoffID: string,
): boolean {
  const escaped = escapeRegExp(handoffID);
  return new RegExp(`^\\[handoff-id\\]:\\s+${escaped}\\s*$`, "m").test(text);
}

async function getFirstUserMessageText({
  client,
  directory,
  session,
}: {
  client: OpencodeClient;
  directory: string;
  session: GlobalSession;
}): Promise<string> {
  const messagesResponse = await client.session.messages({
    directory,
    sessionID: session.id,
  });
  const messages = (messagesResponse.data ?? []) as MessageLike[];

  for (const message of messages) {
    if (!isUserMessage(message)) {
      continue;
    }

    const text = getNonSyntheticTextParts(message).join("\n").trim();
    if (text) {
      return text;
    }
  }

  return "";
}

function isUserMessage(message: MessageLike): boolean {
  return (message.info?.role ?? message.role) === "user";
}

function getNonSyntheticTextParts(message: MessageLike): string[] {
  return (message.parts ?? [])
    .map((part) => part as TextPartLike)
    .filter((part) => part.type === "text")
    .filter((part) => !part.synthetic)
    .map((part) => part.text)
    .filter((text): text is string => typeof text === "string");
}

function compareSessions(a: GlobalSession, b: GlobalSession): number {
  return b.time.updated - a.time.updated || a.id.localeCompare(b.id);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
