import type { Plugin } from "@opencode-ai/plugin";
import { createOpencodeClient } from "@opencode-ai/sdk/v2";
import { commands } from "./commands/index";
import { SESSION_SEARCH_COMMAND_NAME } from "./commands/session-search";
import {
  createReadSessionTool,
  READ_SESSION_TOOL_NAME,
} from "./session-reference/read-session-tool";
import { injectSessionReferenceContext } from "./session-reference/injector";
import { buildSessionSearchCommandParts } from "./session-reference/search";

export const ThreadflowPlugin: Plugin = async (input) => {
  const sessionClient = createOpencodeClient({
    baseUrl: input.serverUrl.toString(),
    directory: input.directory,
  });

  return {
    tool: {
      [READ_SESSION_TOOL_NAME]: createReadSessionTool({
        client: sessionClient,
        directory: input.directory,
      }),
    },
    config: async (config) => {
      config.command = {
        ...(config.command ?? {}),
        ...commands,
      };
      config.tools = {
        ...(config.tools ?? {}),
        [READ_SESSION_TOOL_NAME]: true,
      };
    },
    "command.execute.before": async (command, output) => {
      if (command.command !== SESSION_SEARCH_COMMAND_NAME) {
        return;
      }

      output.parts.push(
        ...(await buildSessionSearchCommandParts({
          client: sessionClient,
          directory: input.directory,
          query: command.arguments,
        })),
      );
    },
    "chat.message": async (messageInput, output) => {
      await injectSessionReferenceContext({
        client: sessionClient,
        directory: input.directory,
        sessionID: messageInput.sessionID,
        ...(messageInput.agent ? { agent: messageInput.agent } : {}),
        ...(messageInput.model ? { model: messageInput.model } : {}),
        ...(messageInput.variant ? { variant: messageInput.variant } : {}),
        parts: output.parts,
      });
    },
  };
};

export default ThreadflowPlugin;
