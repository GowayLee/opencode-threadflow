const SESSION_ID_RE = /ses_[A-Za-z0-9]+/g;

const LEADING_SEPARATORS_RE = /^[\s;,\u2192\-\|]+/;
const TRAILING_SEPARATORS_RE = /[\s;,\u2192\-\|]+$/;

export interface ChainEntry {
  id: string;
  label: string;
}

export interface HandoffInjectionPredecessorSource {
  sessionID: string;
  handoffID: string;
}

/**
 * Parse the payload of a `[handoff-source-chain]:` marker line into an array
 * of {id, label} entries using ID-anchored extraction.
 *
 * The parser locates all `ses_*` IDs in the payload, then uses the text
 * between adjacent IDs as the label for the preceding ID.  Labels are
 * trimmed of leading/trailing separator residues (`;`, `,`, `→`, `|`,
 * whitespace, etc.).
 */
export function parseChainMarker(payload: string): ChainEntry[] {
  const matches: Array<{ id: string; index: number }> = [];
  const re = new RegExp(SESSION_ID_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(payload)) !== null) {
    matches.push({ id: m[0], index: m.index });
  }

  if (matches.length === 0) {
    return [];
  }

  const entries: ChainEntry[] = [];

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i]!;
    const next = matches[i + 1];

    let label: string;
    if (next) {
      label = payload.slice(current.index + current.id.length, next.index);
    } else {
      label = payload.slice(current.index + current.id.length);
    }

    label = label
      .replace(LEADING_SEPARATORS_RE, "")
      .replace(TRAILING_SEPARATORS_RE, "");

    entries.push({ id: current.id, label });
  }

  return entries;
}

/**
 * Format a parsed chain for injection into the handoff command context.
 *
 * Produces a human-readable arrow chain like:
 *   `ses_AAA` Implement auth → `ses_BBB` Fix token
 */
export function formatChainForInjection(chain: ChainEntry[]): string {
  return chain
    .map((entry) => {
      const label = entry.label ? ` ${entry.label}` : "";
      return `\`${entry.id}\`${label}`;
    })
    .join(" → ");
}

/**
 * Build the injection text for the handoff command.execute.before hook.
 *
 * When `upstreamChain` is non-empty, the text includes the current session ID
 * and the upstream task flow chain with labels, plus a `read_session` hint.
 * When empty, the text only includes the current session ID (existing behavior).
 */
export function buildHandoffInjectionText(params: {
  sessionID: string;
  handoffID?: string;
  upstreamChain: ChainEntry[];
  predecessorSources?: HandoffInjectionPredecessorSource[];
  unresolvedHandoffIDs?: string[];
}): string {
  const {
    sessionID,
    handoffID,
    upstreamChain,
    predecessorSources = [],
    unresolvedHandoffIDs = [],
  } = params;
  const hasUpstream = upstreamChain.length > 0;

  const lines: string[] = [
    "---",
    "§ included by opencode-threadflow plugin",
    "",
  ];

  lines.push(`当前 session ID: \`${sessionID}\``);
  if (handoffID) {
    lines.push(`本次 handoff ID: \`${handoffID}\``);
  }

  if (hasUpstream) {
    lines.push(`上游任务流: ${formatChainForInjection(upstreamChain)}`);
    lines.push("可通过 `read_session` 逐级回溯完整任务意图。");
  }

  if (predecessorSources.length > 0) {
    lines.push("已解析前序子会话:");
    for (const source of predecessorSources) {
      lines.push(`- \`${source.sessionID}\` via \`${source.handoffID}\``);
    }
    lines.push(
      "这些前序子会话仅是可通过 `read_session` 回看的 source pointer，不是事实摘要。",
    );
  }

  if (unresolvedHandoffIDs.length > 0) {
    lines.push("未解析前序 handoff:");
    for (const unresolvedID of unresolvedHandoffIDs) {
      lines.push(`- \`${unresolvedID}\``);
    }
    lines.push("不要为未解析 handoff 编造子会话 ID。");
  }

  lines.push("---");

  return lines.join("\n");
}

/**
 * Scan a payload string for a `[handoff-source-chain]:` marker and extract
 * the upstream chain (entries excluding the current session).
 *
 * Returns the parsed upstream chain, or an empty array if no marker is found
 * or the marker only contains the current session.
 */
export function extractUpstreamChain(
  payload: string,
  currentSessionID: string,
): ChainEntry[] {
  const markerMatch = payload.match(
    /^\s*\[handoff-source-chain\]:\s+([^\r\n]+)(?:\r?\n|$)/,
  );
  if (!markerMatch) {
    return [];
  }
  const chain = parseChainMarker(markerMatch[1]!);
  return chain.filter((entry) => entry.id !== currentSessionID);
}
