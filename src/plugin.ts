import type { Plugin } from "@opencode-ai/plugin";
import { createOpencodeClient } from "@opencode-ai/sdk/v2";
import { commands } from "./commands";
import { registerHandoffHooks } from "./handoff";
import { registerSessionHooks, registerSessionTools } from "./sessions";

export const ThreadflowPlugin: Plugin = async (input) => {
  const context = {
    client: createOpencodeClient({
      baseUrl: input.serverUrl.toString(),
      directory: input.directory,
    }),
    directory: input.directory,
  };
  const sessionTools = registerSessionTools(context);
  const sessionHooks = registerSessionHooks(context);
  const handoffHooks = registerHandoffHooks(context);

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
      await sessionHooks["command.execute.before"](command, output);
      await handoffHooks["command.execute.before"](command, output);
    },
    "chat.message": sessionHooks["chat.message"],
  };
};

export default ThreadflowPlugin;
