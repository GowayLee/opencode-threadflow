import type { Part } from "@opencode-ai/sdk";
import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import type { Locale } from "../i18n/types";
import { HANDOFF_COMMAND_NAME } from "../commands/handoff";
import { buildHandoffCommandContextText } from "./command-context";

type ThreadflowPluginContext = {
  client: OpencodeClient;
  directory: string;
  locale: Locale;
};

type CommandInput = {
  command: string;
  sessionID: string;
};

type CommandOutput = {
  parts: Part[];
};

export function registerHandoffHooks({
  client,
  directory,
  locale,
}: ThreadflowPluginContext) {
  return {
    "command.execute.before": async (
      command: CommandInput,
      output: CommandOutput,
    ) => {
      if (command.command !== HANDOFF_COMMAND_NAME) {
        return;
      }

      output.parts.push(
        createSyntheticTextPart(
          await buildHandoffCommandContextText({
            client,
            directory,
            sessionID: command.sessionID,
            locale,
          }),
        ),
      );
    },
  };
}

function createSyntheticTextPart(text: string): Part {
  return {
    type: "text",
    text,
    synthetic: true,
  } as unknown as Part;
}
