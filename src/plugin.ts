import type { Plugin } from "@opencode-ai/plugin";
import { commands } from "./commands/index";

export const ThreadflowPlugin: Plugin = async () => {
  return {
    config: async (config) => {
      config.command = {
        ...(config.command ?? {}),
        ...commands,
      };
    },
  };
};

export default ThreadflowPlugin;
