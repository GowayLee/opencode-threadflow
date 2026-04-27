import { tool } from "@opencode-ai/plugin";
import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import { buildSessionContextPack, buildSessionPreviewPack } from "./refinement";
import type { Locale } from "../i18n/types";
import { t } from "../i18n";

export const READ_SESSION_TOOL_NAME = "read_session";

type ReadSessionMode = "full" | "preview";

type ReadSessionToolParams = {
  client: OpencodeClient;
  directory: string;
  locale: Locale;
};

export function createReadSessionTool({
  client,
  directory,
  locale,
}: ReadSessionToolParams) {
  return tool({
    description:
      'Read a historical session by complete session-id. Use mode "preview" for a trimmed message preview or mode "full" for the complete context pack.',
    args: {
      sessionID: tool.schema
        .string()
        .min(1)
        .describe("Complete session-id to read, for example ses_123abc"),
      mode: tool.schema
        .enum(["full", "preview"])
        .optional()
        .describe(
          'Output mode. Defaults to "full". Use "preview" to inspect selected user/assistant messages before reading the full context pack.',
        ),
    },
    execute: async ({ sessionID, mode }, context) => {
      const normalizedSessionID = sessionID.trim();
      const readMode: ReadSessionMode = mode ?? "full";

      if (!isCompleteSessionID(normalizedSessionID))
        return renderUnreadableResult(
          locale,
          t(locale, "tool.read_session.incomplete_id"),
        );

      const sessionResponse = await client.session.get({
        directory,
        sessionID: normalizedSessionID,
      });

      const session = sessionResponse.data;

      if (!session)
        return renderUnreadableResult(
          locale,
          t(locale, "tool.read_session.not_found", {
            sessionID: normalizedSessionID,
          }),
        );

      context.metadata({
        title: `Read session ${normalizedSessionID}`,
        metadata: {
          sessionID: normalizedSessionID,
          mode: readMode,
        },
      });

      const buildPack =
        readMode === "preview"
          ? buildSessionPreviewPack
          : buildSessionContextPack;

      return (
        (await buildPack({
          client,
          directory,
          sessionID: normalizedSessionID,
          locale,
        })) ??
        renderUnreadableResult(
          locale,
          t(locale, "tool.read_session.not_found", {
            sessionID: normalizedSessionID,
          }),
        )
      );
    },
  });
}

function isCompleteSessionID(value: string): boolean {
  return /^ses_[A-Za-z0-9]+$/.test(value);
}

function renderUnreadableResult(locale: Locale, reason: string): string {
  return [
    "# Session Context Pack",
    "",
    t(locale, "tool.read_session.unreadable"),
    "",
    reason,
  ].join("\n");
}
