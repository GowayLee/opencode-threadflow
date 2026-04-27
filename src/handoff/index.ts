import type { Part } from "@opencode-ai/sdk";
import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import { HANDOFF_COMMAND_NAME } from "../commands/handoff";
import { buildHandoffCommandContextText } from "./command-context";

type ThreadflowPluginContext = {
  client: OpencodeClient;
  directory: string;
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
