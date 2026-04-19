import { HANDOFF_COMMAND_NAME, handoffCommand } from "./handoff";
import {
  SESSION_SEARCH_COMMAND_NAME,
  sessionSearchCommand,
} from "./session-search";

export const commands = {
  [HANDOFF_COMMAND_NAME]: handoffCommand,
  [SESSION_SEARCH_COMMAND_NAME]: sessionSearchCommand,
};
