import { HANDOFF_COMMAND_NAME, handoffCommand } from "./handoff";
import { NAME_SESSION_COMMAND_NAME, nameSessionCommand } from "./name-session";
import {
  SEARCH_SESSION_COMMAND_NAME,
  sessionSearchCommand,
} from "./session-search";

export const commands = {
  [HANDOFF_COMMAND_NAME]: handoffCommand,
  [NAME_SESSION_COMMAND_NAME]: nameSessionCommand,
  [SEARCH_SESSION_COMMAND_NAME]: sessionSearchCommand,
};
