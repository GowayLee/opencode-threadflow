import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createOpencodeClient, createOpencodeServer } from "@opencode-ai/sdk";
import type { Message, Part, ToolPart } from "@opencode-ai/sdk";

const SESSION_IDS = [
  "ses_25f1d2e22ffeeau3rxS1D6je8x",
  "ses_25ecc5a89fferms5vu4KQ9OwP3",
] as const;

type SessionMessageRecord = {
  info: Message;
  parts: Array<Part>;
};

function summarizePart(part: Part) {
  const base = {
    id: part.id,
    type: part.type,
  };

  if (part.type === "text") {
    return {
      ...base,
      synthetic: part.synthetic ?? false,
      ignored: part.ignored ?? false,
      metadataKeys: Object.keys(part.metadata ?? {}),
      textPreview: part.text.slice(0, 160),
      textLength: part.text.length,
    };
  }

  if (part.type === "tool") {
    const state = part.state;
    const common = {
      ...base,
      tool: part.tool,
      callID: part.callID,
      status: state.status,
      metadataKeys: Object.keys(part.metadata ?? {}),
    };

    if (state.status === "completed") {
      return {
        ...common,
        title: state.title,
        inputKeys: Object.keys(state.input),
        outputPreview: state.output.slice(0, 160),
        outputLength: state.output.length,
        stateMetadataKeys: Object.keys(state.metadata ?? {}),
        attachmentCount: state.attachments?.length ?? 0,
      };
    }

    if (state.status === "error") {
      return {
        ...common,
        inputKeys: Object.keys(state.input),
        error: state.error,
        stateMetadataKeys: Object.keys(state.metadata ?? {}),
      };
    }

    if (state.status === "running") {
      return {
        ...common,
        title: state.title,
        inputKeys: Object.keys(state.input),
        stateMetadataKeys: Object.keys(state.metadata ?? {}),
      };
    }

    return {
      ...common,
      inputKeys: Object.keys(state.input),
      rawPreview: state.raw.slice(0, 160),
    };
  }

  if (part.type === "file") {
    return {
      ...base,
      mime: part.mime,
      filename: part.filename,
      url: part.url,
      sourceType: part.source?.type,
      sourcePath: part.source?.path,
    };
  }

  if (part.type === "patch") {
    return {
      ...base,
      files: part.files,
      hash: part.hash,
    };
  }

  if (part.type === "agent") {
    return {
      ...base,
      name: part.name,
      source: part.source,
    };
  }

  if (part.type === "reasoning") {
    return {
      ...base,
      metadataKeys: Object.keys(part.metadata ?? {}),
      textPreview: part.text.slice(0, 160),
      textLength: part.text.length,
    };
  }

  if (part.type === "subtask") {
    return {
      ...base,
      agent: part.agent,
      description: part.description,
      promptPreview: part.prompt.slice(0, 160),
      promptLength: part.prompt.length,
    };
  }

  if (part.type === "step-start") {
    return {
      ...base,
      snapshot: part.snapshot,
    };
  }

  if (part.type === "step-finish") {
    return {
      ...base,
      reason: part.reason,
      snapshot: part.snapshot,
      cost: part.cost,
      tokens: part.tokens,
    };
  }

  if (part.type === "snapshot") {
    return {
      ...base,
      snapshotPreview: part.snapshot.slice(0, 160),
      snapshotLength: part.snapshot.length,
    };
  }

  if (part.type === "retry") {
    return {
      ...base,
      attempt: part.attempt,
      error: part.error,
    };
  }

  return {
    ...base,
    auto: part.auto,
  };
}

function summarizeMessage(message: SessionMessageRecord) {
  const info = message.info;
  const toolParts = message.parts.filter(
    (part): part is ToolPart => part.type === "tool",
  );

  return {
    id: info.id,
    role: info.role,
    createdAt: new Date(info.time.created).toISOString(),
    completedAt:
      info.role === "assistant" && info.time.completed
        ? new Date(info.time.completed).toISOString()
        : null,
    summary: "summary" in info ? info.summary : undefined,
    error: info.role === "assistant" ? (info.error ?? null) : null,
    partCount: message.parts.length,
    partTypes: message.parts.map((part) => part.type),
    toolNames: toolParts.map((part) => part.tool),
    parts: message.parts.map(summarizePart),
  };
}

function buildSessionStats(messages: Array<SessionMessageRecord>) {
  const byRole: Record<string, number> = {};
  const byPartType: Record<string, number> = {};
  const byTool: Record<string, number> = {};

  for (const message of messages) {
    byRole[message.info.role] = (byRole[message.info.role] ?? 0) + 1;
    for (const part of message.parts) {
      byPartType[part.type] = (byPartType[part.type] ?? 0) + 1;
      if (part.type === "tool") {
        byTool[part.tool] = (byTool[part.tool] ?? 0) + 1;
      }
    }
  }

  return {
    messageCount: messages.length,
    byRole,
    byPartType,
    byTool,
  };
}

async function main() {
  const outputDir = path.resolve(
    process.cwd(),
    "docs/transcript-samples/runtime",
  );
  await mkdir(outputDir, { recursive: true });

  const server = await createOpencodeServer({ port: 0 });
  const client = createOpencodeClient({ baseUrl: server.url });

  try {
    for (const sessionID of SESSION_IDS) {
      const [sessionResponse, messagesResponse] = await Promise.all([
        client.session.get({ path: { id: sessionID } }),
        client.session.messages({
          path: { id: sessionID },
          query: { limit: 500 },
        }),
      ]);

      const session = sessionResponse.data;
      const messages = (messagesResponse.data ??
        []) as Array<SessionMessageRecord>;
      const stats = buildSessionStats(messages);
      const summary = {
        sessionID,
        session,
        stats,
        messages: messages.map(summarizeMessage),
      };

      await writeFile(
        path.join(outputDir, `${sessionID}.raw.json`),
        JSON.stringify({ session, messages }, null, 2),
      );
      await writeFile(
        path.join(outputDir, `${sessionID}.summary.json`),
        JSON.stringify(summary, null, 2),
      );

      console.log(
        `${sessionID}: ${messages.length} messages, parts=${JSON.stringify(stats.byPartType)}`,
      );
    }
  } finally {
    server.close();
  }
}

await main();
