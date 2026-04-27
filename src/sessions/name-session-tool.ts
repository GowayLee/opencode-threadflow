import { tool } from "@opencode-ai/plugin";
import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import type { Locale } from "../i18n/types";
import { t } from "../i18n";

export const NAME_SESSION_TOOL_NAME = "name_session";

type NameSessionToolParams = {
  client: OpencodeClient;
  directory: string;
  locale: Locale;
};

export function createNameSessionTool({
  client,
  directory,
  locale,
}: NameSessionToolParams) {
  return tool({
    description:
      "Rename the current session with a structured, search-optimized title following the [action][target] topic protocol to improve session discoverability.",
    args: {
      title: tool.schema
        .string()
        .min(1)
        .describe("New title for the current session"),
    },
    execute: async ({ title }, context) => {
      const sessionID = context.sessionID;

      const getResult = await client.session.get({ directory, sessionID });
      const session = getResult.data;

      const oldTitle = session?.title ?? "";

      if (title === oldTitle) {
        return renderNoChange(locale, sessionID, oldTitle);
      }

      const updateResult = await client.session.update({
        sessionID,
        directory,
        title,
      });

      if (updateResult.error)
        return renderError(
          locale,
          sessionID,
          oldTitle,
          title,
          JSON.stringify(updateResult.error),
        );

      return renderSuccess(locale, sessionID, oldTitle, title);
    },
  });
}

function renderNoChange(
  locale: Locale,
  sessionID: string,
  title: string,
): string {
  return [
    "## Session Renamed",
    "",
    t(locale, "tool.name_session.no_change", { sessionID, title }),
  ].join("\n");
}

function renderSuccess(
  locale: Locale,
  sessionID: string,
  oldTitle: string,
  newTitle: string,
): string {
  return [
    "## Session Renamed",
    "",
    t(locale, "tool.name_session.success", { sessionID, oldTitle, newTitle }),
  ].join("\n");
}

function renderError(
  locale: Locale,
  sessionID: string,
  oldTitle: string,
  newTitle: string,
  reason: string,
): string {
  return [
    "## Session Renamed",
    "",
    t(locale, "tool.name_session.error", {
      sessionID,
      oldTitle,
      newTitle,
      reason,
    }),
  ].join("\n");
}
