import type { Locale } from "../i18n/types";
import { t } from "../i18n";
import { HANDOFF_COMMAND_NAME } from "./handoff";
import { NAME_SESSION_COMMAND_NAME } from "./name-session";
import { SEARCH_SESSION_COMMAND_NAME } from "./session-search";

export function createCommands(locale: Locale) {
  return {
    [HANDOFF_COMMAND_NAME]: {
      description: t(locale, "command.handoff.description"),
      template: t(locale, "command.handoff.template"),
    },
    [NAME_SESSION_COMMAND_NAME]: {
      description: t(locale, "command.name_session.description"),
      template: t(locale, "command.name_session.template"),
    },
    [SEARCH_SESSION_COMMAND_NAME]: {
      description: t(locale, "command.session_search.description"),
      template: t(locale, "command.session_search.template"),
    },
  };
}
