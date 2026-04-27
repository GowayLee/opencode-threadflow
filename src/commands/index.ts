import type { Locale } from "../i18n/types";
import { t } from "../i18n";
import { HANDOFF_COMMAND_NAME } from "./handoff";
import { NAME_SESSION_COMMAND_NAME } from "./name-session";
import { SEARCH_SESSION_COMMAND_NAME } from "./session-search";

export function createCommands(locale: Locale) {
  return {
    [HANDOFF_COMMAND_NAME]: {
      description:
        "Create an editable handoff note for continuing work in a new session",
      template: t(locale, "command.handoff.template"),
    },
    [NAME_SESSION_COMMAND_NAME]: {
      description:
        "为当前 session 生成结构化标题并重命名，提升 session 列表可读性和 find_session 检索召回效果",
      template: t(locale, "command.name_session.template"),
    },
    [SEARCH_SESSION_COMMAND_NAME]: {
      description:
        "Search recent sessions and return copyable session IDs for explicit references",
      template: t(locale, "command.session_search.template"),
    },
  };
}
