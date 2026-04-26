import { tool } from "@opencode-ai/plugin";
import type { OpencodeClient } from "@opencode-ai/sdk/v2";

export const NAME_SESSION_TOOL_NAME = "name_session";

type NameSessionToolParams = {
  client: OpencodeClient;
  directory: string;
};

export function createNameSessionTool({
  client,
  directory,
}: NameSessionToolParams) {
  return tool({
    description:
      "Rename the current session with a structured, search-optimized title following the [动作][对象] 主题 protocol to improve session discoverability.",
    args: {
      title: tool.schema
        .string()
        .min(1)
        .describe("New title for the current session"),
    },
    execute: async ({ title }, context) => {
      const sessionID = context.sessionID;

      const getResult = await client.session.get({ directory, sessionID });
      const session = getResult.data;

      const oldTitle = session?.title ?? "";

      if (title === oldTitle) {
        return renderNoChange(sessionID, oldTitle);
      }

      const updateResult = await client.session.update({
        sessionID,
        directory,
        title,
      });

      if (updateResult.error)
        return renderError(
          sessionID,
          oldTitle,
          title,
          JSON.stringify(updateResult.error),
        );

      return renderSuccess(sessionID, oldTitle, title);
    },
  });
}

function renderNoChange(sessionID: string, title: string): string {
  return [
    "## Session Renamed",
    "",
    "Session 标题无需变更。",
    "",
    `| Field      | Value          |`,
    `| ---------- | -------------- |`,
    `| Session ID | \`${sessionID}\` |`,
    `| Title      | ${title}       |`,
    "",
    "新标题与当前标题相同，未执行更新操作。",
  ].join("\n");
}

function renderSuccess(
  sessionID: string,
  oldTitle: string,
  newTitle: string,
): string {
  return [
    "## Session Renamed",
    "",
    `| Field      | Value                                   |`,
    `| ---------- | --------------------------------------- |`,
    `| Session ID | \`${sessionID}\`                        |`,
    `| Old title  | ${oldTitle}                             |`,
    `| New title  | ${newTitle}                             |`,
    "",
    "Session 标题已更新。",
    "",
    "> **建议**: 当前轮对话用于重命名标题，会对本 session 的任务主线造成噪音污染。建议用户在确认标题后回滚（撤销/删除）本次重命名相关的消息轮次，仅保留标题变更结果。",
  ].join("\n");
}

function renderError(
  sessionID: string,
  oldTitle: string,
  newTitle: string,
  reason: string,
): string {
  return [
    "## Session Renamed",
    "",
    "Session 重命名失败。",
    "",
    `| Field      | Value                                   |`,
    `| ---------- | --------------------------------------- |`,
    `| Session ID | \`${sessionID}\`                        |`,
    `| Old title  | ${oldTitle}                             |`,
    `| New title  | ${newTitle} (未应用)                    |`,
    `| Error      | ${reason}                               |`,
    "",
    "请检查权限后重试。",
  ].join("\n");
}
