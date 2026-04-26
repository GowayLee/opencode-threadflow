import type { Plugin } from "@opencode-ai/plugin";
import type { Part } from "@opencode-ai/sdk";
import { createOpencodeClient } from "@opencode-ai/sdk/v2";
import { commands } from "./commands/index";
import { HANDOFF_COMMAND_NAME } from "./commands/handoff";
import { NAME_SESSION_COMMAND_NAME } from "./commands/name-session";
import { SEARCH_SESSION_COMMAND_NAME } from "./commands/session-search";
import {
  createFindSessionTool,
  FIND_SESSION_TOOL_NAME,
} from "./session-reference/find-session-tool";
import {
  createNameSessionTool,
  NAME_SESSION_TOOL_NAME,
} from "./session-reference/name-session-tool";
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
      [FIND_SESSION_TOOL_NAME]: createFindSessionTool({
        client: sessionClient,
        directory: input.directory,
      }),
      [NAME_SESSION_TOOL_NAME]: createNameSessionTool({
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
        [FIND_SESSION_TOOL_NAME]: true,
        [NAME_SESSION_TOOL_NAME]: true,
      };
    },
    "command.execute.before": async (command, output) => {
      if (command.command === NAME_SESSION_COMMAND_NAME) {
        const sessionResult = await sessionClient.session.get({
          directory: input.directory,
          sessionID: command.sessionID,
        });
        const currentTitle = sessionResult.data?.title ?? "（未获取到标题）";
        output.parts.push({
          type: "text",
          text: [
            "---",
            "§ included by opencode-threadflow plugin",
            "",
            `当前 session ID: \`${command.sessionID}\``,
            `当前 session 标题: ${currentTitle}`,
            "---",
          ].join("\n"),
          synthetic: true,
        } as unknown as Part);
        return;
      }

      if (command.command === HANDOFF_COMMAND_NAME) {
        output.parts.push({
          type: "text",
          text: [
            "---",
            "§ included by opencode-threadflow plugin",
            "",
            `This session ID: \`${command.sessionID}\``,
            "---",
          ].join("\n"),
          synthetic: true,
        } as unknown as Part);
        return;
      }

      if (command.command !== SEARCH_SESSION_COMMAND_NAME) {
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
