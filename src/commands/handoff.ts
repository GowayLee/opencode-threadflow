import { t } from "../i18n";

export const HANDOFF_COMMAND_NAME = "handoff";

export const handoffCommand = {
  description: t("zh", "command.handoff.description"),
  template: t("zh", "command.handoff.template"),
} as const;
