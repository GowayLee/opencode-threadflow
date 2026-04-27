import type { Part } from "@opencode-ai/sdk";
import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import { NAME_SESSION_COMMAND_NAME } from "../commands/name-session";
import { SEARCH_SESSION_COMMAND_NAME } from "../commands/session-search";
import {
  createFindSessionTool,
  FIND_SESSION_TOOL_NAME,
} from "./find-session-tool";
import { buildNameSessionHookContext } from "./hook-context";
import { injectSessionReferenceContext } from "./injector";
import {
  createNameSessionTool,
  NAME_SESSION_TOOL_NAME,
} from "./name-session-tool";
import {
  createReadSessionTool,
  READ_SESSION_TOOL_NAME,
} from "./read-session-tool";
import { buildSessionSearchCommandParts } from "./search";

type ThreadflowPluginContext = {
  client: OpencodeClient;
  directory: string;
};

type CommandInput = {
  command: string;
  sessionID: string;
  arguments: string;
};

type CommandOutput = {
  parts: Part[];
};

type ChatMessageInput = {
  sessionID: string;
  agent?: string;
  model?: {
    providerID: string;
    modelID: string;
  };
  variant?: string;
};

type ChatMessageOutput = {
  parts: Part[];
};

export function registerSessionTools({
  client,
  directory,
}: ThreadflowPluginContext) {
  return {
    tool: {
      [READ_SESSION_TOOL_NAME]: createReadSessionTool({ client, directory }),
      [FIND_SESSION_TOOL_NAME]: createFindSessionTool({ client, directory }),
      [NAME_SESSION_TOOL_NAME]: createNameSessionTool({ client, directory }),
    },
    enabled: {
      [READ_SESSION_TOOL_NAME]: true,
      [FIND_SESSION_TOOL_NAME]: true,
      [NAME_SESSION_TOOL_NAME]: true,
    },
  };
}

export function registerSessionHooks({
  client,
  directory,
}: ThreadflowPluginContext) {
  return {
    "command.execute.before": async (
      command: CommandInput,
      output: CommandOutput,
    ) => {
      if (command.command === NAME_SESSION_COMMAND_NAME) {
        output.parts.push(
          await buildNameSessionHookContext({
            client,
            directory,
            sessionID: command.sessionID,
          }),
        );
        return;
      }

      if (command.command !== SEARCH_SESSION_COMMAND_NAME) {
        return;
      }

      output.parts.push(
        ...(await buildSessionSearchCommandParts({
          client,
          directory,
          query: command.arguments,
        })),
      );
    },
    "chat.message": async (
      messageInput: ChatMessageInput,
      output: ChatMessageOutput,
    ) => {
      await injectSessionReferenceContext({
        client,
        directory,
        sessionID: messageInput.sessionID,
        ...(messageInput.agent ? { agent: messageInput.agent } : {}),
        ...(messageInput.model ? { model: messageInput.model } : {}),
        ...(messageInput.variant ? { variant: messageInput.variant } : {}),
        parts: output.parts,
      });
    },
  };
}

export {
  FIND_SESSION_TOOL_NAME,
  NAME_SESSION_TOOL_NAME,
  READ_SESSION_TOOL_NAME,
};
