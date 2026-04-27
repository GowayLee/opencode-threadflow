import type { Part } from "@opencode-ai/sdk";
import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import type { Locale } from "../i18n/types";
import { t } from "../i18n";

export async function buildNameSessionHookContext({
  client,
  directory,
  sessionID,
  locale,
}: {
  client: OpencodeClient;
  directory: string;
  sessionID: string;
  locale: Locale;
}): Promise<Part> {
  const sessionResult = await client.session.get({
    directory,
    sessionID,
  });
  const currentTitle =
    sessionResult.data?.title ??
    t(locale, "hook.name_session.title_unavailable");

  return createSyntheticTextPart(
    [
      "---",
      "§ included by opencode-threadflow plugin",
      "",
      t(locale, "hook.name_session.current_session_id", { sessionID }),
      t(locale, "hook.name_session.current_title", { title: currentTitle }),
      "---",
    ].join("\n"),
  );
}

function createSyntheticTextPart(text: string): Part {
  return {
    type: "text",
    text,
    synthetic: true,
  } as unknown as Part;
}
