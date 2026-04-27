import type { Locale } from "../i18n/types";
import { t } from "../i18n";

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

export function parseChainMarker(payload: string): ChainEntry[] {
  const matches: Array<{ id: string; index: number }> = [];
  const re = new RegExp(SESSION_ID_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(payload)) !== null)
    matches.push({ id: m[0], index: m.index });

  if (matches.length === 0) return [];

  const entries: ChainEntry[] = [];

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i]!;
    const next = matches[i + 1];

    let label: string;
    if (next)
      label = payload.slice(current.index + current.id.length, next.index);
    else label = payload.slice(current.index + current.id.length);

    label = label
      .replace(LEADING_SEPARATORS_RE, "")
      .replace(TRAILING_SEPARATORS_RE, "");

    entries.push({ id: current.id, label });
  }

  return entries;
}

export function formatChainForInjection(chain: ChainEntry[]): string {
  return chain
    .map((entry) => {
      const label = entry.label ? ` ${entry.label}` : "";
      return `\`${entry.id}\`${label}`;
    })
    .join(" → ");
}

export function buildHandoffInjectionText(params: {
  locale: Locale;
  sessionID: string;
  handoffID?: string;
  upstreamChain: ChainEntry[];
  predecessorSources?: HandoffInjectionPredecessorSource[];
  unresolvedHandoffIDs?: string[];
}): string {
  const {
    locale,
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

  lines.push(t(locale, "hook.handoff.current_session_id", { sessionID }));
  if (handoffID) {
    lines.push(t(locale, "hook.handoff.handoff_id", { handoffID }));
  }

  if (hasUpstream) {
    lines.push(
      t(locale, "hook.handoff.upstream_chain", {
        chain: formatChainForInjection(upstreamChain),
      }),
    );
    lines.push(t(locale, "hook.handoff.read_session_hint"));
  }

  if (predecessorSources.length > 0) {
    lines.push(t(locale, "hook.handoff.resolved_predecessors"));
    for (const source of predecessorSources)
      lines.push(
        t(locale, "hook.handoff.predecessor_source_item", {
          sessionID: source.sessionID,
          handoffID: source.handoffID,
        }),
      );
    lines.push(t(locale, "hook.handoff.predecessor_hint"));
  }

  if (unresolvedHandoffIDs.length > 0) {
    lines.push(t(locale, "hook.handoff.unresolved_predecessors"));
    for (const unresolvedID of unresolvedHandoffIDs)
      lines.push(`- \`${unresolvedID}\``);
    lines.push(t(locale, "hook.handoff.dont_fabricate"));
  }

  lines.push("---");

  return lines.join("\n");
}

export function extractUpstreamChain(
  payload: string,
  currentSessionID: string,
): ChainEntry[] {
  const markerMatch = payload.match(
    /^\s*\[handoff-source-chain\]:\s+([^\r\n]+)(?:\r?\n|$)/,
  );
  if (!markerMatch) return [];
  const chain = parseChainMarker(markerMatch[1]!);
  return chain.filter((entry) => entry.id !== currentSessionID);
}
