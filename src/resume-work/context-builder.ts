import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import type { Locale } from "../i18n/types";
import { searchSessions } from "../sessions/search";
import { buildSessionContextPack } from "../sessions/refinement";
import { t } from "../i18n";

const RESUME_WORK_SESSION_COUNT = 5;

type BuildResumeWorkContextParams = {
  client: OpencodeClient;
  directory: string;
  locale: Locale;
  currentSessionID: string;
};

type ResumeWorkSessionInfo = {
  sessionID: string;
  label: string;
  updatedAt: number;
};

type ResumeWorkSessionResult =
  | { status: "loaded"; sessionID: string; label: string; context: string }
  | { status: "failed"; sessionID: string; label: string; reason: string };

type ResumeWorkContextResult = {
  sessions: ResumeWorkSessionResult[];
};

export async function buildResumeWorkContext({
  client,
  directory,
  locale,
  currentSessionID,
}: BuildResumeWorkContextParams): Promise<ResumeWorkContextResult> {
  const recentSessions = await getRecentSessions({
    client,
    directory,
    excludeSessionID: currentSessionID,
    limit: RESUME_WORK_SESSION_COUNT,
    locale,
  });

  if (recentSessions.length === 0) {
    return { sessions: [] };
  }

  const results: ResumeWorkSessionResult[] = [];

  for (const session of recentSessions) {
    try {
      const context = await buildSessionContextPack({
        client,
        directory,
        sessionID: session.sessionID,
        locale,
      });

      if (!context) {
        results.push({
          status: "failed",
          sessionID: session.sessionID,
          label: session.label,
          reason: t(locale, "hook.resume_work.session_not_found"),
        });
        continue;
      }

      results.push({
        status: "loaded",
        sessionID: session.sessionID,
        label: session.label,
        context,
      });
    } catch {
      results.push({
        status: "failed",
        sessionID: session.sessionID,
        label: session.label,
        reason: t(locale, "hook.resume_work.session_load_failed"),
      });
    }
  }

  return { sessions: results };
}

export function renderResumeWorkContext(
  result: ResumeWorkContextResult,
  locale: Locale,
): string {
  if (result.sessions.length === 0) {
    return [
      "## Resume Work Context",
      "",
      t(locale, "hook.resume_work.no_recent_sessions"),
    ].join("\n");
  }

  const loadedSessions = result.sessions.filter((s) => s.status === "loaded");
  const failedSessions = result.sessions.filter((s) => s.status === "failed");

  if (loadedSessions.length === 0) {
    const lines = ["## Resume Work Context", ""];
    lines.push(t(locale, "hook.resume_work.all_failed"));
    for (const session of failedSessions) {
      lines.push(
        `- \`${session.sessionID}\` (${session.label}): ${session.reason}`,
      );
    }
    return lines.join("\n");
  }

  const lines = ["## Resume Work Context", ""];

  for (const session of loadedSessions) {
    lines.push(`---`, "", `### \`${session.sessionID}\` ${session.label}`, "");
    lines.push(session.context, "");
  }

  if (failedSessions.length > 0) {
    lines.push("---", "", t(locale, "hook.resume_work.partial_load_failures"));
    for (const session of failedSessions) {
      lines.push(
        `- \`${session.sessionID}\` (${session.label}): ${session.reason}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function getRecentSessions({
  client,
  directory,
  excludeSessionID,
  limit,
  locale,
}: {
  client: OpencodeClient;
  directory: string;
  excludeSessionID: string;
  limit: number;
  locale: Locale;
}): Promise<ResumeWorkSessionInfo[]> {
  const result = await searchSessions({
    client,
    directory,
    query: "",
    resultLimit: limit + 1,
    locale,
  });

  return result.results
    .filter((r) => r.sessionID !== excludeSessionID)
    .slice(0, limit)
    .map((r) => ({
      sessionID: r.sessionID,
      label: r.label,
      updatedAt: r.updatedAt,
    }));
}
