import type { Part } from "@opencode-ai/sdk";
import type { OpencodeClient } from "@opencode-ai/sdk/v2";

export async function buildNameSessionHookContext({
  client,
  directory,
  sessionID,
}: {
  client: OpencodeClient;
  directory: string;
  sessionID: string;
}): Promise<Part> {
  const sessionResult = await client.session.get({
    directory,
    sessionID,
  });
  const currentTitle = sessionResult.data?.title ?? "（未获取到标题）";

  return createSyntheticTextPart(
    [
      "---",
      "§ included by opencode-threadflow plugin",
      "",
      `当前 session ID: \`${sessionID}\``,
      `当前 session 标题: ${currentTitle}`,
      "---",
    ].join("\n"),
  );
}

function createSyntheticTextPart(text: string): Part {
  return {
    type: "text",
    text,
    synthetic: true,
  } as unknown as Part;
}
