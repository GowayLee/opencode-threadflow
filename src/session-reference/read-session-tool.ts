import { tool } from "@opencode-ai/plugin";
import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import { buildSessionContextPack, buildSessionPreviewPack } from "./refinement";

export const READ_SESSION_TOOL_NAME = "read_session";

type ReadSessionMode = "full" | "preview";

type ReadSessionToolParams = {
  client: OpencodeClient;
  directory: string;
};

export function createReadSessionTool({
  client,
  directory,
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
          "read_session requires a complete `session-id` like `ses_...`; keywords and truncated IDs are not supported.",
        );

      const sessionResponse = await client.session.get({
        directory,
        sessionID: normalizedSessionID,
      });

      const session = sessionResponse.data;

      if (!session)
        return renderUnreadableResult(
          `No session was found for \`${normalizedSessionID}\`.`,
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
        })) ??
        renderUnreadableResult(
          `No session was found for \`${normalizedSessionID}\`.`,
        )
      );
    },
  });
}

function isCompleteSessionID(value: string): boolean {
  return /^ses_[A-Za-z0-9]+$/.test(value);
}

function renderUnreadableResult(reason: string): string {
  return [
    "# Session Context Pack",
    "",
    "Session could not be read.",
    "",
    reason,
  ].join("\n");
}
