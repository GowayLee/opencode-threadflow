import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import {
  buildHandoffInjectionText,
  extractUpstreamChain,
  type ChainEntry,
} from "./chain-parser";
import {
  extractHandoffIDsFromMessages,
  generateNextHandoffID,
  getNonSyntheticTextParts,
  resolvePredecessorSessions,
  type HandoffMessageLike,
  type HandoffPredecessorSource,
} from "./lineage";

export async function buildHandoffCommandContextText({
  client,
  directory,
  sessionID,
}: {
  client: OpencodeClient;
  directory: string;
  sessionID: string;
}): Promise<string> {
  let upstreamChain: ChainEntry[] = [];
  let messages: HandoffMessageLike[] = [];

  try {
    const messagesResponse = await client.session.messages({
      directory,
      sessionID,
    });
    messages = (messagesResponse.data ?? []) as HandoffMessageLike[];
    upstreamChain = extractFirstUpstreamChain(messages, sessionID);
  } catch {
    // Handoff should still work without transcript access.
  }

  const handoffID = generateNextHandoffID(messages, sessionID);
  const historicalHandoffIDs = extractHandoffIDsFromMessages(
    messages,
    sessionID,
  ).map((entry) => entry.id);
  let predecessorSources: HandoffPredecessorSource[] = [];
  let unresolvedHandoffIDs: string[] = [];

  try {
    const resolution = await resolvePredecessorSessions({
      client,
      directory,
      currentSessionID: sessionID,
      handoffIDs: historicalHandoffIDs,
    });
    predecessorSources = resolution.resolved;
    unresolvedHandoffIDs = [
      ...resolution.unresolved,
      ...resolution.ambiguous.map((item) => item.handoffID),
    ];
  } catch {
    unresolvedHandoffIDs = historicalHandoffIDs;
  }

  return buildHandoffInjectionText({
    sessionID,
    handoffID,
    upstreamChain,
    predecessorSources,
    unresolvedHandoffIDs,
  });
}

export function extractFirstUpstreamChain(
  messages: HandoffMessageLike[],
  currentSessionID: string,
): ChainEntry[] {
  for (const message of messages)
    for (const text of getNonSyntheticTextParts(message)) {
      const upstreamChain = extractUpstreamChain(text, currentSessionID);
      if (upstreamChain.length > 0) return upstreamChain;
    }

  return [];
}
