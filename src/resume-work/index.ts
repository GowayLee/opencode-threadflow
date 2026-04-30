import type { Part } from "@opencode-ai/sdk";
import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import type { Locale } from "../i18n/types";
import { RESUME_WORK_COMMAND_NAME } from "../commands/resume-work";
import {
  buildResumeWorkContext,
  renderResumeWorkContext,
} from "./context-builder";

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

export function registerResumeWorkHooks({
  client,
  directory,
  locale,
}: ThreadflowPluginContext) {
  return {
    "command.execute.before": async (
      command: CommandInput,
      output: CommandOutput,
    ) => {
      if (command.command !== RESUME_WORK_COMMAND_NAME) {
        return;
      }

      const result = await buildResumeWorkContext({
        client,
        directory,
        locale,
        currentSessionID: command.sessionID,
      });

      const text = renderResumeWorkContext(result, locale);

      output.parts.push({
        type: "text",
        text,
        synthetic: true,
      } as unknown as Part);
    },
  };
}
