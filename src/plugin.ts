import type { Plugin } from "@opencode-ai/plugin";
import { createOpencodeClient } from "@opencode-ai/sdk/v2";
import type { Locale } from "./i18n/types";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "./i18n/types";
import { createCommands } from "./commands";
import { registerHandoffHooks } from "./handoff";
import { registerResumeWorkHooks } from "./resume-work";
import { registerSessionHooks, registerSessionTools } from "./sessions";

function resolveLocale(options: Record<string, unknown> | undefined): Locale {
  const value = options?.locale;
  if (
    typeof value === "string" &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  ) {
    return value as Locale;
  }
  return DEFAULT_LOCALE;
}

export const ThreadflowPlugin: Plugin = async (input, options) => {
  const locale = resolveLocale(options);
  const context = {
    client: createOpencodeClient({
      baseUrl: input.serverUrl.toString(),
      directory: input.directory,
    }),
    directory: input.directory,
    locale,
  };
  const sessionTools = registerSessionTools(context);
  const sessionHooks = registerSessionHooks(context);
  const handoffHooks = registerHandoffHooks(context);
  const resumeWorkHooks = registerResumeWorkHooks(context);
  const commands = createCommands(locale);

  return {
    tool: sessionTools.tool,
    config: async (config) => {
      config.command = {
        ...(config.command ?? {}),
        ...commands,
      };
      config.tools = {
        ...(config.tools ?? {}),
        ...sessionTools.enabled,
      };
    },
    "command.execute.before": async (command, output) => {
      for (const hook of [sessionHooks, handoffHooks, resumeWorkHooks].map(
        (h) => h["command.execute.before"],
      )) {
        await hook(command, output);
      }
    },
    "chat.message": sessionHooks["chat.message"],
  };
};

export default ThreadflowPlugin;
