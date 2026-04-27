import { t } from "../i18n";

export const SEARCH_SESSION_COMMAND_NAME = "search-session";

export const sessionSearchCommand = {
  description: t("zh", "command.session_search.description"),
  template: t("zh", "command.session_search.template"),
} as const;
